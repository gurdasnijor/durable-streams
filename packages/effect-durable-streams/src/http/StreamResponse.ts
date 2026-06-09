import { HttpServerResponse } from "@effect/platform"
import {
  PRODUCER_EPOCH,
  PRODUCER_EXPECTED_SEQ,
  PRODUCER_RECEIVED_SEQ,
  PRODUCER_SEQ,
  REQ_CONTENT_TYPE,
  STREAM_CLOSED,
  STREAM_NEXT_OFFSET,
  STREAM_UP_TO_DATE,
} from "../headers.ts"
import type * as Store from "../Store.ts"

export const append = (
  decision: Store.AppendDecision
): HttpServerResponse.HttpServerResponse => {
  switch (decision._tag) {
    case `PlainAccepted`:
      return HttpServerResponse.empty({
        status: 204,
        headers: {
          [STREAM_NEXT_OFFSET]: decision.nextOffset,
          ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
        },
      })
    case `ProducerAccepted`:
      return HttpServerResponse.empty({
        status: 200,
        headers: producerHeaders(decision),
      })
    case `ProducerDuplicate`:
      return HttpServerResponse.empty({
        status: 204,
        headers: producerHeaders(decision),
      })
    case `ProducerFenced`:
      return HttpServerResponse.empty({
        status: 403,
        headers: { [PRODUCER_EPOCH]: String(decision.currentEpoch) },
      })
    case `ProducerGap`:
      return decision.expectedSeq === 0
        ? HttpServerResponse.empty({ status: 400 })
        : HttpServerResponse.empty({
            status: 409,
            headers: {
              [PRODUCER_EXPECTED_SEQ]: String(decision.expectedSeq),
              [PRODUCER_RECEIVED_SEQ]: String(decision.receivedSeq),
            },
          })
    case `ClosedConflict`:
      return HttpServerResponse.empty({
        status: 409,
        headers: {
          [STREAM_CLOSED]: `true`,
          [STREAM_NEXT_OFFSET]: decision.finalOffset,
        },
      })
    case `ContentTypeMismatch`:
    case `StreamSeqRegression`:
      return HttpServerResponse.empty({ status: 409 })
  }
}

export const create = (
  decision: Store.CreateDecision,
  contentType: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.empty({
    status: decision._tag === `Created` ? 201 : 200,
    headers: {
      [STREAM_NEXT_OFFSET]: decision.tail,
      ...(contentType ? { [REQ_CONTENT_TYPE]: contentType } : {}),
      ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
    },
  })

export const read = (
  chunk: Store.ReadChunk,
  requestedOffset: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.uint8Array(chunk.body, {
    contentType: chunk.contentType || `application/octet-stream`,
    headers: {
      [STREAM_NEXT_OFFSET]: chunk.nextOffset,
      ...(chunk.upToDate ? { [STREAM_UP_TO_DATE]: `true` } : {}),
      ...(chunk.closed ? { [STREAM_CLOSED]: `true` } : {}),
      etag: etag(chunk, requestedOffset),
      "cache-control": `no-store`,
      "x-content-type-options": `nosniff`,
    },
  })

export const head = (
  tail: Store.StreamTail
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.empty({
    status: 200,
    headers: {
      [STREAM_NEXT_OFFSET]: tail.tailOffset,
      ...(tail.contentType ? { [REQ_CONTENT_TYPE]: tail.contentType } : {}),
      ...(tail.closed ? { [STREAM_CLOSED]: `true` } : {}),
    },
  })

const producerHeaders = (
  decision: Extract<
    Store.AppendDecision,
    { readonly _tag: `ProducerAccepted` | `ProducerDuplicate` }
  >
) => ({
  [STREAM_NEXT_OFFSET]: decision.nextOffset,
  [PRODUCER_EPOCH]: String(decision.producerEpoch),
  [PRODUCER_SEQ]: String(decision.highestAcceptedSeq),
  ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
})

const etag = (chunk: Store.ReadChunk, start: string): string =>
  `"${start}:${chunk.nextOffset}:${chunk.closed ? `c` : `o`}"`
