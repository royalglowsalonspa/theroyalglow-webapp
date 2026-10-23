import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

// A separate Node process keeps Bun's actual nested package resolution intact.
// Vitest must not make an incompatible vendor Zod copy look like our direct copy.
// The only Payload methods here are inert fixtures: no database, HTTP listener,
// application configuration, credentials, or outbound requests are initialized.
const runtimeProbe = `
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const cms = createRequire(resolve('apps/cms/package.json'))
const entrypoint = realpathSync(cms.resolve('@payloadcms/plugin-mcp'))
const plugin = createRequire(entrypoint)
const vendorDirectory = dirname(entrypoint)
const vendorImport = (path) => import(pathToFileURL(resolve(vendorDirectory, path)).href)
const { toolSchemas } = await vendorImport('mcp/tools/schemas.js')
const { findResourceTool } = await vendorImport('mcp/tools/resource/find.js')
const { z } = await import(pathToFileURL(plugin.resolve('zod')).href)
const { McpServer } = await import(
  pathToFileURL(plugin.resolve('@modelcontextprotocol/sdk/server/mcp.js')).href,
)
const { Client } = await import(
  pathToFileURL(plugin.resolve('@modelcontextprotocol/sdk/client/index.js')).href,
)
const { InMemoryTransport } = await import(
  pathToFileURL(plugin.resolve('@modelcontextprotocol/sdk/inMemory.js')).href,
)

const schemaNames = Object.keys(toolSchemas)
const findSchema = z.toJSONSchema(toolSchemas.findResources.parameters)
const selectedFields = { name: true, pricePaise: true }
const serializedSchemas = schemaNames.map((name) => ({
  name,
  schema: z.toJSONSchema(toolSchemas[name].parameters),
}))
const server = new McpServer({ name: 'offline-payload-compatibility', version: '1.0.0' })
const client = new Client({ name: 'offline-compatibility-client', version: '1.0.0' })
for (const name of schemaNames) {
  server.registerTool('compat_' + name, {
    inputSchema: toolSchemas[name].parameters.shape,
  }, async () => ({ content: [{ type: 'text', text: 'schema registered' }] }))
}

const calls = []
const user = { id: 'offline-editor' }
const request = {
  payload: {
    logger: { info() {}, warn() {}, error() {} },
    async find(options) {
      calls.push({
        collection: options.collection,
        limit: options.limit,
        page: options.page,
        depth: options.depth,
        select: options.select,
        where: options.where,
        overrideAccess: options.overrideAccess,
        sameRequest: options.req === request,
        sameUser: options.user === user,
      })
      return {
        docs: [{ id: 'offline-service', name: 'Haircut', pricePaise: 10000 }],
        totalDocs: 1,
        page: 1,
        totalPages: 1,
      }
    },
  },
}
findResourceTool(server, request, user, false, 'service', {
  service: { enabled: { find: true }, description: 'Offline bookable service fixture' },
})
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
try {
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const listed = await client.listTools()
  const result = await client.callTool({
    name: 'findService',
    arguments: {
      limit: 2,
      page: 1,
      depth: 1,
      select: findSchema.properties.select.type === 'object'
        ? selectedFields
        : JSON.stringify(selectedFields),
      where: JSON.stringify({ isActive: { equals: true } }),
    },
  })
  const rejected = []
  for (const args of [{ limit: 0 }, { depth: 11 }, { limit: 'two' }]) {
    try {
      const response = await client.callTool({ name: 'findService', arguments: args })
      rejected.push(response.isError === true)
    } catch (error) {
      rejected.push(error.message.includes('Invalid arguments'))
    }
  }
  // Exercise the plugin's record schemas too, even though this application's
  // production configuration only enables read tools. This catches v3/v4 record
  // construction incompatibilities before a future plugin release is merged.
  const records = {
    createJob: toolSchemas.createJob.parameters.safeParse({
      description: 'Offline task',
      jobName: 'offlineTask',
      jobSlug: 'offline-task',
      jobType: 'task',
      inputSchema: { id: 'string' },
      outputSchema: { ok: 'boolean' },
      jobData: { retries: 1 },
    }).success,
    updateJob: toolSchemas.updateJob.parameters.safeParse({
      jobSlug: 'offline-task',
      updateType: 'modify_schema',
      configUpdate: { retries: 2 },
      inputSchema: { id: 'string' },
      outputSchema: { ok: 'boolean' },
    }).success,
    runJob: toolSchemas.runJob.parameters.safeParse({
      jobSlug: 'offline-task',
      input: { id: 'offline-service' },
    }).success,
  }
  process.stdout.write(JSON.stringify({
    zodMajor: Number(plugin('zod/package.json').version.split('.')[0]),
    allSchemasListed: schemaNames.every((name) => listed.tools.some((tool) => tool.name === 'compat_' + name)),
    schemaNames,
    serializedSchemas,
    listedNames: listed.tools.map((tool) => tool.name),
    readResult: result,
    calls,
    rejected,
    records,
  }))
} finally {
  await client.close()
  await server.close()
}
`

// This checks the schema generator separately. The plugin's disabled write-tool
// converter also needs TypeScript's legacy compiler API, which TypeScript 7 no
// longer exports. Using Bun here proves the Zod migration; it does not claim that
// the native write-tool converter supports TypeScript 7 or enable those tools.
const converterProbe = `
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const cms = createRequire(resolve('apps/cms/package.json'))
const plugin = createRequire(realpathSync(cms.resolve('@payloadcms/plugin-mcp')))
const { z } = await import(pathToFileURL(plugin.resolve('zod')).href)
const { jsonSchemaToZod } = await import(pathToFileURL(plugin.resolve('json-schema-to-zod')).href)
const fixtures = [
  {
    name: 'records',
    schema: {
      type: 'object',
      properties: { metadata: { type: 'object', additionalProperties: { type: 'string' } } },
      required: ['metadata'],
    },
    valid: { metadata: { category: 'salon' } },
    invalid: { metadata: { category: 100 } },
  },
  {
    name: 'exclusiveUnions',
    schema: {
      type: 'object',
      properties: { value: { oneOf: [{ type: 'string' }, { type: 'number' }] } },
      required: ['value'],
    },
    valid: { value: 'salon' },
    invalid: { value: true },
  },
  {
    name: 'nestedArrays',
    schema: {
      type: 'object',
      properties: {
        services: {
          type: 'array', minItems: 1, maxItems: 10,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              pricePaise: { type: 'integer', minimum: 0 },
              metadata: { type: 'object', additionalProperties: { type: 'string' } },
            },
            required: ['name', 'pricePaise', 'metadata'],
          },
        },
      },
      required: ['services'],
    },
    valid: { services: [{ name: 'Haircut', pricePaise: 10000, metadata: { category: 'salon' } }] },
    invalid: { services: [{ name: 'Haircut', pricePaise: -1, metadata: { category: 100 } }] },
  },
]
const transpiler = new Bun.Transpiler({ loader: 'ts' })
const results = fixtures.map((fixture) => {
  const output = transpiler.transformSync(jsonSchemaToZod(fixture.schema, {
    module: 'cjs', noImport: true,
  }))
  const holder = { exports: undefined }
  new Function('z', 'module', output)(z, holder)
  const schema = holder.exports
  if (!(schema instanceof z.ZodObject)) throw new Error('Expected a retained object schema')
  return {
    name: fixture.name,
    fields: Object.keys(schema.shape),
    valid: schema.safeParse(fixture.valid).success,
    invalid: schema.safeParse(fixture.invalid).success,
    missing: schema.safeParse({}).success,
    serializedType: z.toJSONSchema(schema).type,
  }
})
process.stdout.write(JSON.stringify(results))
`
describe('installed Payload MCP runtime compatibility', () => {
  let result: unknown
  let converted: unknown

  beforeAll(() => {
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', runtimeProbe], {
      cwd: resolve(import.meta.dirname, '../../../../..'),
      encoding: 'utf8',
      timeout: 30_000,
    })
    result = JSON.parse(output)
    converted = JSON.parse(
      execFileSync('bun', ['--eval', converterProbe], {
        cwd: resolve(import.meta.dirname, '../../../../..'),
        encoding: 'utf8',
        timeout: 30_000,
      }),
    )
  }, 35_000)

  it('uses the maintained Zod runtime and exposes every native tool schema through the SDK', () => {
    expect(result).toMatchObject({
      zodMajor: 4,
      allSchemasListed: true,
      schemaNames: expect.arrayContaining(['findResources', 'createJob', 'updateJob', 'runJob']),
      serializedSchemas: expect.arrayContaining([
        { name: 'findResources', schema: expect.objectContaining({ type: 'object' }) },
        { name: 'createJob', schema: expect.objectContaining({ type: 'object' }) },
        { name: 'updateJob', schema: expect.objectContaining({ type: 'object' }) },
        { name: 'runJob', schema: expect.objectContaining({ type: 'object' }) },
      ]),
      listedNames: expect.arrayContaining([
        'findService',
        'compat_findResources',
        'compat_createJob',
        'compat_updateJob',
        'compat_runJob',
      ]),
      records: { createJob: true, updateJob: true, runJob: true },
    })
  })

  it('validates read arguments and preserves Payload access enforcement and paise values', () => {
    expect(result).toMatchObject({
      calls: [
        {
          collection: 'service',
          limit: 2,
          page: 1,
          depth: 1,
          select: { name: true, pricePaise: true },
          where: { isActive: { equals: true } },
          overrideAccess: false,
          sameRequest: true,
          sameUser: true,
        },
      ],
      readResult: {
        content: [
          {
            type: 'text',
            text: expect.stringContaining('"pricePaise":10000'),
          },
        ],
      },
      rejected: [true, true, true],
    })
  })

  it('retains required fields and nested validation when generating Zod 4 record and union schemas', () => {
    expect(converted).toEqual([
      {
        name: 'records',
        fields: ['metadata'],
        valid: true,
        invalid: false,
        missing: false,
        serializedType: 'object',
      },
      {
        name: 'exclusiveUnions',
        fields: ['value'],
        valid: true,
        invalid: false,
        missing: false,
        serializedType: 'object',
      },
      {
        name: 'nestedArrays',
        fields: ['services'],
        valid: true,
        invalid: false,
        missing: false,
        serializedType: 'object',
      },
    ])
  })
})
