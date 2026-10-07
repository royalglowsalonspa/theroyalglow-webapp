import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

// Use Node's real package resolution in a fresh process: Vitest's module loader
// must not flatten an incompatible CMS/vendor GraphQL split into one instance.
const runtimeProbe = `
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const cms = createRequire(resolve('apps/cms/package.json'))
const next = createRequire(realpathSync(cms.resolve('@payloadcms/next/routes')))
const { buildConfig } = await import(pathToFileURL(cms.resolve('payload')).href)
const { configToSchema } = await import(pathToFileURL(next.resolve('@payloadcms/graphql')).href)
const graphql = cms('graphql')
let databaseInitializations = 0
const config = await buildConfig({
  secret: 'database-free-graphql-compatibility-fixture',
  telemetry: false,
  typescript: { autoGenerate: false },
  db: {
    name: 'database-free-fixture',
    defaultIDType: 'text',
    init() {
      databaseInitializations += 1
      throw new Error('The GraphQL compatibility test must not initialize a database')
    },
  },
  collections: [],
  graphQL: {
    maxComplexity: 2,
    queries: (vendorGraphQL) => ({
      compatibilityEcho: {
        type: vendorGraphQL.GraphQLString,
        args: {
          message: { type: new vendorGraphQL.GraphQLNonNull(vendorGraphQL.GraphQLString) },
          cost: { type: vendorGraphQL.GraphQLInt },
        },
        extensions: { complexity: ({ args }) => args.cost ?? 1 },
        resolve: (_source, args) => args.message,
      },
    }),
  },
})
const { schema, validationRules } = configToSchema(config)
const query = graphql.parse(
  'query Compatibility($message: String!, $cost: Int = 3) {' +
  ' compatibilityEcho(message: $message, cost: $cost) }',
)
function validate(variableValues) {
  return graphql.validate(schema, query, [
    ...graphql.specifiedRules,
    ...validationRules({ schema, document: query, variableValues }),
  ]).map((error) => error.message)
}
const variables = { message: 'compatible', cost: 2 }
const acceptedErrors = validate(variables)
const execution = await graphql.execute({
  schema,
  document: query,
  variableValues: variables,
  contextValue: { req: {} },
})
process.stdout.write(JSON.stringify({
  acceptedErrors,
  execution,
  suppliedCostErrors: validate({ message: 'compatible', cost: 3 }),
  defaultCostErrors: validate({ message: 'compatible' }),
  invalidVariableErrors: validate({ message: 'compatible', cost: 'invalid' }),
  databaseInitializations,
}))
`

describe('installed CMS GraphQL runtime compatibility', () => {
  let result: unknown

  beforeAll(() => {
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', runtimeProbe], {
      cwd: resolve(import.meta.dirname, '../..'),
      encoding: 'utf8',
      timeout: 30_000,
    })
    result = JSON.parse(output)
  }, 35_000)

  it('validates and executes the vendor schema using the CMS GraphQL instance without a database', () => {
    expect(result).toMatchObject({
      acceptedErrors: [],
      execution: { data: { compatibilityEcho: 'compatible' } },
      databaseInitializations: 0,
    })
    expect(result).toHaveProperty('execution', { data: { compatibilityEcho: 'compatible' } })
  })

  it('rejects excessive query complexity from both supplied and defaulted variables', () => {
    const errors = ['The query exceeds the maximum complexity of 2. Actual complexity is 3']
    expect(result).toMatchObject({ suppliedCostErrors: errors, defaultCostErrors: errors })
  })

  it('reports invalid variables through the vendor validation rule', () => {
    expect(result).toMatchObject({
      invalidVariableErrors: [expect.stringContaining('Int cannot represent non-integer value')],
    })
  })
})
