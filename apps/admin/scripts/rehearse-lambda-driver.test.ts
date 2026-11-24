import { afterEach, describe, expect, it, vi } from 'vitest'
import { handler, verifyDriverEnvironment } from './rehearse-lambda-driver'

const { batch, execute } = vi.hoisted(() => ({ batch: vi.fn(), execute: vi.fn() }))
vi.mock('@rgss/db', () => ({ db: { batch, execute } }))

const host = 'ep-probe-fixture.c-2.ap-southeast-1.aws.neon.tech'
const env = {
  AWS_LAMBDA_FUNCTION_NAME: 'rgss-rehearsal-mb312-driver',
  AWS_REGION: 'ap-southeast-1',
  REHEARSAL_DRIVER_NEON_HOST: host,
  DATABASE_URL: `postgresql://rgss_rehearsal_probe:fixture@${host}/rgss_rehearsal_driver?sslmode=require`,
}
const context = {
  awsRequestId: 'cd231356-3532-4c2d-b595-719523920002',
  logStreamName: 'rehearsal-stream',
}

function simulateBatch(remaining: number, cause: object) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  execute
    .mockResolvedValueOnce({ rows: [{ value: 1 }] })
    .mockResolvedValueOnce({
      rows: [{ database: 'rgss_rehearsal_driver', role: 'rgss_rehearsal_probe' }],
    })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ remaining }] })
  batch.mockRejectedValueOnce(cause)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

describe('private Lambda database rehearsal', () => {
  it('requires a dedicated Lambda, exact database and verified host', () => {
    expect(() => verifyDriverEnvironment(env)).not.toThrow()
    expect(() =>
      verifyDriverEnvironment({ ...env, AWS_LAMBDA_FUNCTION_NAME: 'rgss-production-driver' }),
    ).toThrow('dedicated Singapore Lambda')
    expect(() =>
      verifyDriverEnvironment({
        ...env,
        DATABASE_URL: env.DATABASE_URL.replace(host, 'other.test'),
      }),
    ).toThrow('dedicated Singapore Lambda')
    expect(() =>
      verifyDriverEnvironment({
        ...env,
        DATABASE_URL: env.DATABASE_URL.replace('/rgss_rehearsal_driver?', '/neondb?'),
      }),
    ).toThrow('dedicated Singapore Lambda')
  })

  it('requires the named guard failure and verifies that the preceding write rolled back', async () => {
    simulateBatch(0, { code: '23514', constraint: 'rgss_rehearsal_positive_amount' })
    const evidence = await handler({}, context)
    expect(evidence).toMatchObject({
      requestId: context.awsRequestId,
      logStreamName: context.logStreamName,
      healthMs: expect.any(Number),
      rolledBack: true,
    })
    expect(batch).toHaveBeenCalledTimes(1)
  })

  it('refuses an unrelated database failure or a retained write', async () => {
    simulateBatch(0, { code: '23514', constraint: 'unexpected_constraint' })
    await expect(handler({}, context)).rejects.toThrow('expected check constraint')
    vi.resetAllMocks()
    simulateBatch(
      1,
      new Error('Query failed', {
        cause: { code: '23514', constraint: 'rgss_rehearsal_positive_amount' },
      }),
    )
    await expect(handler({}, context)).rejects.toThrow('did not roll back')
  })
})
