import prettierPlugin from "eslint-plugin-prettier"
import prettierConfig from "eslint-config-prettier"
import stylisticPlugin from "@stylistic/eslint-plugin"
import { tanstackConfig } from "@tanstack/config/eslint"

const manualProtocolNumericParsers = new Set([
  `Number`,
  `parseFloat`,
  `parseInt`,
])

const manualProtocolDecodeNames =
  /^(decode|parse).*(uint|int|number|integer|seq|epoch|offset|ttl)$/iu

const localPlugin = {
  rules: {
    "schema-protocol-boundaries": {
      meta: {
        type: `problem`,
        docs: {
          description: `Require Effect Schema/shared schemas at Effect server protocol decode boundaries.`,
        },
        messages: {
          manualParser: `effect-server.TOOLING.1: protocol/header numeric decoding must use Effect Schema or shared protocol schemas, not hand-written parsers.`,
          manualDecodeHelper: `effect-server.TOOLING.1: protocol decode helpers must be Schema-backed; do not add hand-written numeric decode helpers.`,
        },
        schema: [],
      },
      create(context) {
        const calleeName = (callee) => {
          if (callee?.type === `Identifier`) return callee.name
          return undefined
        }
        const reportManualParser = (node) => {
          const name = calleeName(node.callee)
          if (name !== undefined && manualProtocolNumericParsers.has(name)) {
            context.report({ node, messageId: `manualParser` })
          }
        }
        const reportManualDecodeName = (node, name) => {
          if (manualProtocolDecodeNames.test(name)) {
            context.report({ node, messageId: `manualDecodeHelper` })
          }
        }

        return {
          CallExpression: reportManualParser,
          NewExpression: reportManualParser,
          FunctionDeclaration(node) {
            if (node.id?.name !== undefined) {
              reportManualDecodeName(node.id, node.id.name)
            }
          },
          VariableDeclarator(node) {
            if (node.id?.type === `Identifier`) {
              reportManualDecodeName(node.id, node.id.name)
            }
          },
        }
      },
    },
    "no-fake-conformance-substrate": {
      meta: {
        type: `problem`,
        docs: {
          description: `Keep execution conformance tests bound to production seams instead of fake Durable Streams substrates.`,
        },
        messages: {
          fakeResponse: `effect-execution.TOOLING.1: conformance must not implement fake fetch/server/substrate responses for production protocol guarantees.`,
          fakeFactory: `effect-execution.TOOLING.1: conformance must not define fake Durable Streams substrates/transports/servers; keep the case blocked until the real seam exists.`,
        },
        schema: [],
      },
      create(context) {
        const fakeFactoryNames =
          /^(make|create|start).*(substrate|transport|server|fetch)$/iu
        const reportFakeFactory = (node, name) => {
          if (fakeFactoryNames.test(name)) {
            context.report({ node, messageId: `fakeFactory` })
          }
        }

        return {
          NewExpression(node) {
            if (
              node.callee?.type === `Identifier` &&
              node.callee.name === `Response`
            ) {
              context.report({ node, messageId: `fakeResponse` })
            }
          },
          FunctionDeclaration(node) {
            if (node.id?.name !== undefined) {
              reportFakeFactory(node.id, node.id.name)
            }
          },
          VariableDeclarator(node) {
            if (node.id?.type === `Identifier`) {
              reportFakeFactory(node.id, node.id.name)
            }
          },
        }
      },
    },
  },
}

export default [
  ...tanstackConfig,
  {
    ignores: [
      `**/dist/**`,
      `**/build/**`,
      `**/.output/**`,
      `**/coverage/**`,
      `docs/.vitepress/**`,
      `eslint.config.js`,
      `vitest.config.ts`,
      `**/vite.config.ts`,
      `**/tsdown.config.ts`,
      `**/tsup.config.ts`,
      `packages/caddy-plugin/**`,
      `packages/client-py/**`,
      `scripts/**`,
      `**/bin/**`,
    ],
  },
  {
    plugins: {
      local: localPlugin,
      stylistic: stylisticPlugin,
      prettier: prettierPlugin,
    },
    settings: {
      // import-x/* settings required for import/no-cycle.
      "import-x/resolver": { typescript: true },
      "import-x/extensions": [`.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`],
    },
    rules: {
      "prettier/prettier": `error`,
      "stylistic/quotes": [`error`, `backtick`, { avoidEscape: true }],
      "pnpm/enforce-catalog": `off`,
      "pnpm/json-enforce-catalog": `off`,
      ...prettierConfig.rules,
    },
  },
  {
    files: [`**/*.ts`, `**/*.tsx`],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        `error`,
        { argsIgnorePattern: `^_`, varsIgnorePattern: `^_` },
      ],
      "@typescript-eslint/naming-convention": [
        `error`,
        {
          selector: `typeParameter`,
          format: [`PascalCase`],
          leadingUnderscore: `allow`,
        },
      ],
      "import/no-cycle": `error`,
    },
  },
  {
    files: [`packages/effect-durable-streams/src/**/*.ts`],
    rules: {
      "local/schema-protocol-boundaries": `error`,
    },
  },
  {
    files: [`packages/effect-durable-execution/test/conformance/**/*.ts`],
    rules: {
      "local/no-fake-conformance-substrate": `error`,
    },
  },
]
