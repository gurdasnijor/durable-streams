import { describe, expect, it, vi } from "vitest"
import {
  STREAM_CLOSED_HEADER,
  STREAM_CURSOR_HEADER,
  STREAM_OFFSET_HEADER,
  STREAM_UP_TO_DATE_HEADER,
  stream,
} from "../src/index"

const sseResponse = (text: string, headers: Record<string, string> = {}) =>
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text))
        controller.close()
      },
    }),
    {
      status: 200,
      headers: {
        "content-type": `text/event-stream`,
        [STREAM_OFFSET_HEADER]: `1`,
        [STREAM_CURSOR_HEADER]: `c`,
        ...headers,
      },
    }
  )

describe(`SSE recovery hardening`, () => {
  it(`already-aborted signal performs zero fetches`, async () => {
    const ac = new AbortController()
    ac.abort(`pre`)
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(``, {
        status: 200,
        headers: {
          [STREAM_OFFSET_HEADER]: `1`,
          [STREAM_UP_TO_DATE_HEADER]: `true`,
        },
      })
    )
    await expect(
      stream({ url: `https://example.com/s`, fetch, signal: ac.signal })
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(0)
  })

  it(`abort during fetch backoff sleep performs no extra fetch`, async () => {
    const ac = new AbortController()
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response(`err`, { status: 503 }))
    const p = stream({
      url: `https://example.com/s`,
      fetch,
      signal: ac.signal,
      backoffOptions: {
        initialDelay: 1000,
        maxDelay: 1000,
        multiplier: 1,
        maxRetries: 5,
      },
    }).catch((e) => e)
    setTimeout(() => ac.abort(), 5)
    const err = await p
    expect(String(err)).toMatch(/aborted|abort/i)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it(`SSE onError retry uses refreshed header on SSE start`, async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(``, {
          status: 200,
          headers: {
            [STREAM_OFFSET_HEADER]: `1`,
            [STREAM_CURSOR_HEADER]: `c`,
            [STREAM_UP_TO_DATE_HEADER]: `true`,
          },
        })
      )
      .mockResolvedValueOnce(new Response(`unauth`, { status: 401 }))
      .mockResolvedValueOnce(
        sseResponse(
          `event: data\ndata: hello\n\nevent: control\ndata: {"streamNextOffset":"2","streamCursor":"c2","upToDate":true,"streamClosed":true}\n\n`,
          {
            [STREAM_OFFSET_HEADER]: `2`,
            [STREAM_CURSOR_HEADER]: `c2`,
            [STREAM_UP_TO_DATE_HEADER]: `true`,
            [STREAM_CLOSED_HEADER]: `true`,
          }
        )
      )
    const res = await stream({
      url: `https://example.com/s`,
      fetch,
      live: `sse`,
      headers: { Authorization: `old` },
      onError: () => ({ headers: { Authorization: `new` } }),
      backoffOptions: {
        initialDelay: 1,
        maxDelay: 1,
        multiplier: 1,
        maxRetries: 0,
      },
    })
    const chunks: Array<string> = []
    res.subscribeText((chunk) => {
      chunks.push(chunk.text)
      return Promise.resolve()
    })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(
      (fetch.mock.calls[2]![1]!.headers as Record<string, string>).Authorization
    ).toBe(`new`)
  })

  it(`SSE short-connection fallback continues with long-poll`, async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(``, {
          status: 200,
          headers: {
            [STREAM_OFFSET_HEADER]: `1`,
            [STREAM_CURSOR_HEADER]: `c`,
            [STREAM_UP_TO_DATE_HEADER]: `true`,
          },
        })
      )
      .mockResolvedValueOnce(
        sseResponse(
          `event: control\ndata: {"streamNextOffset":"1","streamCursor":"c"}\n\n`
        )
      )
      .mockResolvedValueOnce(
        new Response(`lp`, {
          status: 200,
          headers: {
            [STREAM_OFFSET_HEADER]: `2`,
            [STREAM_CURSOR_HEADER]: `c2`,
            [STREAM_UP_TO_DATE_HEADER]: `true`,
            [STREAM_CLOSED_HEADER]: `true`,
          },
        })
      )
    const res = await stream({
      url: `https://example.com/s`,
      fetch,
      live: `sse`,
      sseResilience: {
        minConnectionDuration: 10_000,
        maxShortConnections: 1,
        backoffBaseDelay: 0,
        backoffMaxDelay: 0,
        logWarnings: false,
      },
    })
    const chunks: Array<string> = []
    res.subscribeText((chunk) => {
      chunks.push(chunk.text)
      return Promise.resolve()
    })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(fetch.mock.calls[2]![0]).toBe(
      `https://example.com/s?offset=1&cursor=c`
    )
  })

  it(`live=sse initial catch-up body failure rejects stream() before returning`, async () => {
    const body = new ReadableStream({
      pull(controller) {
        controller.error(new Error(`body failed`))
      },
    })
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          [STREAM_OFFSET_HEADER]: `1`,
          [STREAM_UP_TO_DATE_HEADER]: `true`,
        },
      })
    )
    await expect(
      stream({ url: `https://example.com/s`, fetch, live: `sse` })
    ).rejects.toThrow(/body failed/i)
  })
})
