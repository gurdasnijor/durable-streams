import { HttpRouter } from "@effect/platform"
import { Effect } from "effect"
import { StreamHttp } from "../StreamHttp.ts"
import type { StreamHttpHandler, StreamHttpShape } from "../StreamHttp.ts"

const use = (select: (service: StreamHttpShape) => StreamHttpHandler) =>
  StreamHttp.pipe(Effect.flatMap(select))

export const router = HttpRouter.empty.pipe(
  HttpRouter.put(
    `/v1/stream/*`,
    use((_) => _.create)
  ),
  HttpRouter.post(
    `/v1/stream/*`,
    use((_) => _.append)
  ),
  HttpRouter.head(
    `/v1/stream/*`,
    use((_) => _.head)
  ),
  HttpRouter.get(
    `/v1/stream/*`,
    use((_) => _.read)
  ),
  HttpRouter.del(
    `/v1/stream/*`,
    use((_) => _.remove)
  )
)
