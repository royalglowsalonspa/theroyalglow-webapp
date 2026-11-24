import assert from 'node:assert/strict'
import test from 'node:test'
import { readInvocationReport, verifyRehearsalTarget } from './rehearse-lambda-health.mjs'

const functionName = 'rgss-rehearsal-check-AdminServerFixture'
const target = {
  stage: 'rehearsal-check',
  arn: `arn:aws:lambda:ap-southeast-1:012345678901:function:${functionName}`,
  distributionId: 'FIXTURE',
  revisionId: 'fixture001',
}

function awsFixture(origin = 'admin', aliases = []) {
  const functionHostname = 'admin-fixture.lambda-url.ap-southeast-1.on.aws'
  const responses = {
    'list-tags': { Tags: { 'sst:app': 'rgss', 'sst:stage': target.stage } },
    'get-function-configuration': { RevisionId: target.revisionId, CodeSha256: 'fixture' },
    'get-function-url-config': { FunctionUrl: `https://${functionHostname}/` },
    'get-distribution': {
      Distribution: {
        Status: 'Deployed',
        DomainName: 'd123.cloudfront.net',
        DistributionConfig: {
          Enabled: true,
          Aliases: { Quantity: aliases.length, Items: aliases },
          DefaultCacheBehavior: { TargetOriginId: origin },
          Origins: { Items: [{ Id: 'admin', DomainName: functionHostname }] },
        },
      },
    },
  }
  return (_, operation) => responses[operation]
}

test('accepts only an isolated stage and the expected admin revision', () => {
  assert.equal(verifyRehearsalTarget(target, awsFixture()).hostname, 'd123.cloudfront.net')
  assert.throws(
    () => verifyRehearsalTarget({ ...target, stage: 'production' }, () => assert.fail()),
    /nonproduction SST stage/,
  )
  assert.throws(
    () => verifyRehearsalTarget({ ...target, revisionId: 'wrong' }, awsFixture()),
    /reviewed deployed revision/,
  )
})

test('requires an exact alias when set and refuses a distribution defaulting to another origin', () => {
  assert.throws(
    () => verifyRehearsalTarget(target, awsFixture('web')),
    /distribution does not match/,
  )
  assert.throws(
    () => verifyRehearsalTarget(target, awsFixture('admin', ['admin.staging.example'])),
    /distribution does not match/,
  )
  const adminOrigin = 'https://admin.staging.example'
  const aliased = { ...target, adminOrigin }
  assert.equal(
    verifyRehearsalTarget(aliased, awsFixture('admin', ['admin.staging.example'])).hostname,
    'admin.staging.example',
  )
  assert.throws(
    () => verifyRehearsalTarget(aliased, awsFixture('admin', ['unrelated.staging.example'])),
    /distribution does not match/,
  )
  assert.throws(
    () =>
      verifyRehearsalTarget({ ...target, adminOrigin: 'https://admin.theroyalglow.in' }, () =>
        assert.fail(),
      ),
    /reviewed rehearsal admin/,
  )
})

test('correlates text and structured reports to the invocation and reads cold and warm metrics', () => {
  const requestId = 'fixture-123'
  const text = `REPORT RequestId: ${requestId}\tDuration: 35.5 ms\tBilled Duration: 52 ms\tInit Duration: 16.1 ms`
  assert.equal(readInvocationReport(text, 'other'), null)
  assert.deepEqual(readInvocationReport(text, requestId), { durationMs: 35.5, initMs: 16.1 })
  assert.throws(() => readInvocationReport(`${text}\tStatus: timeout`, requestId), /failed/)

  const json = JSON.stringify({
    type: 'platform.report',
    record: { requestId, status: 'success', metrics: { durationMs: 10 } },
  })
  assert.deepEqual(readInvocationReport(json, requestId), { durationMs: 10, initMs: null })
})
