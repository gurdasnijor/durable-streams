# effect-durable-client

## 0.0.1

### Patch Changes

- Scaffold the shared Durable Streams Effect HttpApi contract and wire the Effect client to it, adding read-only handles, explicit ReadFrom sentinels, CEL branded filter helpers, split single/batch append APIs, and conformance witnesses. ([`9eef52a`](https://github.com/durable-streams/durable-streams/commit/9eef52afe870c5056a492649190f39cf5a3c9dad))

- Split the Effect Durable Streams client into `effect-durable-client`, reserve `effect-durable-streams` for the Effect-native server, and add the first ordered storage backend scaffold. ([`64a6c09`](https://github.com/durable-streams/durable-streams/commit/64a6c09b7e6f8dfba15db1989c60ffa75777d330))

- Updated dependencies [[`9eef52a`](https://github.com/durable-streams/durable-streams/commit/9eef52afe870c5056a492649190f39cf5a3c9dad)]:
  - durable-streams-protocol@0.0.1
