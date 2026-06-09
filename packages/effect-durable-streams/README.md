# `effect-durable-streams`

Effect-native Durable Streams server implementation.

The package is being built from `docs/sdds/effect-native-server-sdd.md` and
`features/durable-streams/effect-server.feature.yaml`. The first build slice is
the ordered key-value storage driver used by the future protocol/domain store.

The server store remains Durable-Streams-shaped. `OrderedKvStore` is a lower
driver seam for durable backends such as LMDB, not the public protocol store.
