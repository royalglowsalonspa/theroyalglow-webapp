import { describe, expect, it } from 'vitest'
import {
  type DashboardIssue,
  type GitHubRequest,
  requestBody,
  requestRenovateRun,
  selectDashboard,
  waitForRenovateAcknowledgement,
} from './request-renovate-run'

const BODY = [
  '# Dependency updates',
  '- [ ] <!-- approve renovate/major-payload-graphql-migration -->Approve major migration',
  '- [x] <!-- approve renovate/undici-8.x -->Previously approved update',
  '- [ ] <!-- rebase renovate/platform-dependencies -->Rebase update',
  '- [ ] <!-- manual job -->Check this box to trigger a request for Renovate to run again on this repository',
].join('\n')

function issue(overrides: Partial<DashboardIssue> = {}): DashboardIssue {
  return {
    number: 301,
    title: 'Dependency updates',
    body: BODY,
    state: 'open',
    updatedAt: '2026-10-12T00:00:00Z',
    author: 'renovate[bot]',
    authorType: 'Bot',
    isPullRequest: false,
    ...overrides,
  }
}

function jsonIssue(dashboard = issue()) {
  return {
    number: dashboard.number,
    title: dashboard.title,
    body: dashboard.body,
    state: dashboard.state,
    updated_at: dashboard.updatedAt,
    user: { login: dashboard.author, type: dashboard.authorType },
    ...(dashboard.isPullRequest ? { pull_request: { url: 'https://example.invalid' } } : {}),
  }
}

function fakeGitHub(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  const request: GitHubRequest = async (url, init) => {
    calls.push({ url, init })
    const response = responses.shift()
    if (!response) throw new Error('Unexpected additional GitHub request')
    return response
  }
  return { calls, request }
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { etag: '"dashboard-revision"' } })
const options = {
  repository: 'example/repo',
  token: 'test-only-token',
  title: 'Dependency updates',
}

describe('native Renovate run request', () => {
  it('changes only the manual checkbox and preserves approvals, rebases and CRLF newlines', () => {
    const body = BODY.replaceAll('\n', '\r\n')
    expect(requestBody(body)).toBe(
      body.replace('- [ ] <!-- manual job -->', '- [x] <!-- manual job -->'),
    )
  })

  it.each([
    ['missing marker', BODY.replace('<!-- manual job -->', '<!-- unrelated -->')],
    ['duplicate marker', `${BODY}\n- [ ] <!-- manual job -->Another control`],
    ['malformed control', BODY.replace('- [ ] <!-- manual job -->', '* [ ] <!-- manual job -->')],
  ])('rejects %s instead of touching other controls', (_name, body) => {
    expect(() => requestBody(body)).toThrow()
  })

  it('requires one open dashboard created by the official bot, excluding PRs and lookalikes', () => {
    const dashboard = issue()
    expect(
      selectDashboard(
        [
          issue({ author: 'someone', authorType: 'User' }),
          issue({ isPullRequest: true }),
          issue({ state: 'closed' }),
          issue({ title: 'Different title' }),
          dashboard,
        ],
        options.title,
      ),
    ).toBe(dashboard)
    expect(() => selectDashboard([], options.title)).toThrow('exactly one')
    expect(() => selectDashboard([dashboard, issue({ number: 302 })], options.title)).toThrow(
      'found 2',
    )
  })

  it('uses the current body and only sends a body PATCH with the defensive revision header', async () => {
    const original = jsonIssue()
    const github = fakeGitHub([
      response([original]),
      response(original),
      response(original),
      response(jsonIssue(issue({ body: requestBody(BODY) }))),
    ])
    await expect(requestRenovateRun({ ...options, request: github.request })).resolves.toEqual({
      number: 301,
      url: 'https://github.com/example/repo/issues/301',
      state: 'requested',
    })
    expect(github.calls).toHaveLength(4)
    const patch = github.calls[3]?.init
    expect(patch?.method).toBe('PATCH')
    expect(patch?.body).toBe(JSON.stringify({ body: requestBody(BODY) }))
    expect(patch?.headers).toMatchObject({ 'If-Match': '"dashboard-revision"' })
  })

  it('preserves a maintainer approval added between reads by rebuilding from the fresh body', async () => {
    const changed = issue({
      body: BODY.replace('- [ ] <!-- approve', '- [x] <!-- approve'),
      updatedAt: '2026-10-12T00:00:01Z',
    })
    const github = fakeGitHub([
      response([jsonIssue()]),
      response(jsonIssue()),
      response(jsonIssue(changed)),
      response(jsonIssue(changed)),
      response(jsonIssue(changed)),
      response(jsonIssue({ ...changed, body: requestBody(changed.body) })),
    ])
    await requestRenovateRun({ ...options, request: github.request })
    expect(github.calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(1)
    expect(github.calls[5]?.init.body).toBe(JSON.stringify({ body: requestBody(changed.body) }))
  })

  it('retries rejected conditional writes from a new dashboard snapshot', async () => {
    const original = jsonIssue()
    const github = fakeGitHub([
      response([original]),
      response(original),
      response(original),
      response({ message: 'Precondition failed' }, 412),
      response(original),
      response(original),
      response(jsonIssue(issue({ body: requestBody(BODY) }))),
    ])
    await requestRenovateRun({ ...options, request: github.request })
    expect(github.calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(2)
  })

  it('fails visibly on insufficient GitHub permissions without another mutation', async () => {
    const original = jsonIssue()
    const github = fakeGitHub([
      response([original]),
      response(original),
      response(original),
      response({ message: 'Resource not accessible by integration' }, 403),
    ])
    await expect(requestRenovateRun({ ...options, request: github.request })).rejects.toThrow(
      'HTTP 403',
    )
    expect(github.calls.filter((call) => call.init.method === 'PATCH')).toHaveLength(1)
  })

  it('rejects a missing dashboard without writing or creating an issue', async () => {
    const github = fakeGitHub([response([])])
    await expect(requestRenovateRun({ ...options, request: github.request })).rejects.toThrow(
      'found 0',
    )
    expect(github.calls).toHaveLength(1)
  })

  it('returns an already requested run without rewriting any dashboard controls', async () => {
    const pending = issue({ body: requestBody(BODY) })
    const github = fakeGitHub([response([jsonIssue(pending)]), response(jsonIssue(pending))])
    await expect(
      requestRenovateRun({ ...options, request: github.request }),
    ).resolves.toMatchObject({
      number: 301,
      state: 'already-requested',
    })
    expect(github.calls).toHaveLength(2)
    expect(github.calls.every((call) => !call.init.method)).toBe(true)
  })

  it('omits weak If-Match validators while still re-reading the fresh dashboard', async () => {
    const original = jsonIssue()
    const weak = new Response(JSON.stringify(original), { headers: { etag: 'W/"weak-revision"' } })
    const github = fakeGitHub([
      response([original]),
      response(original),
      weak,
      response(jsonIssue(issue({ body: requestBody(BODY) }))),
    ])
    await requestRenovateRun({ ...options, request: github.request })
    expect(github.calls).toHaveLength(4)
    expect(github.calls[3]?.init.headers).not.toHaveProperty('If-Match')
  })
})

function acknowledgementResponse(body: string, editor = 'renovate', number = 301) {
  return response({
    data: {
      repository: {
        issue: {
          number,
          title: options.title,
          state: 'OPEN',
          body,
          author: { login: 'renovate', __typename: 'Bot' },
          editor: { login: editor, __typename: editor === 'renovate' ? 'Bot' : 'User' },
        },
      },
    },
  })
}

function fakeClock() {
  let elapsed = 0
  const pauses: number[] = []
  return {
    now: () => elapsed,
    sleep: async (milliseconds: number) => {
      pauses.push(milliseconds)
      elapsed += milliseconds
    },
    pauses,
  }
}

describe('hosted Renovate request acknowledgement', () => {
  it('waits for the official bot to clear the manual request while preserving major approvals', async () => {
    const pending = requestBody(BODY)
    const github = fakeGitHub([acknowledgementResponse(pending), acknowledgementResponse(BODY)])
    const clock = fakeClock()
    await waitForRenovateAcknowledgement({
      ...options,
      number: 301,
      request: github.request,
      ...clock,
    })
    expect(clock.pauses).toEqual([30_000])
    expect(github.calls).toHaveLength(2)
    expect(github.calls.every((call) => call.url === 'https://api.github.com/graphql')).toBe(true)
    expect(github.calls.every((call) => call.init.method === 'POST')).toBe(true)
    expect(
      github.calls.every((call) =>
        String(call.init.body).includes('query DashboardAcknowledgement'),
      ),
    ).toBe(true)
    expect(BODY).toContain('- [ ] <!-- approve renovate/major-payload-graphql-migration -->')
    expect(BODY).toContain('- [x] <!-- approve renovate/undici-8.x -->')
  })

  it('does not accept a human checkbox clear as hosted bot acknowledgement', async () => {
    const github = fakeGitHub([
      acknowledgementResponse(BODY, 'maintainer'),
      acknowledgementResponse(BODY),
    ])
    const clock = fakeClock()
    await waitForRenovateAcknowledgement({
      ...options,
      number: 301,
      request: github.request,
      ...clock,
    })
    expect(clock.pauses).toEqual([30_000])
    expect(github.calls).toHaveLength(2)
  })

  it('fails a stuck request within its bounded timeout without any mutation', async () => {
    const pending = requestBody(BODY)
    const github = fakeGitHub([
      acknowledgementResponse(pending),
      acknowledgementResponse(pending),
      acknowledgementResponse(pending),
    ])
    const clock = fakeClock()
    await expect(
      waitForRenovateAcknowledgement({
        ...options,
        number: 301,
        request: github.request,
        timeoutMs: 2_000,
        intervalMs: 1_000,
        ...clock,
      }),
    ).rejects.toThrow('did not acknowledge')
    expect(clock.pauses).toEqual([1_000, 1_000])
    expect(github.calls).toHaveLength(3)
    expect(github.calls.every((call) => call.init.method !== 'PATCH')).toBe(true)
  })

  it('rejects acknowledgement from a different dashboard', async () => {
    const github = fakeGitHub([acknowledgementResponse(BODY, 'renovate', 999)])
    await expect(
      waitForRenovateAcknowledgement({
        ...options,
        number: 301,
        request: github.request,
        ...fakeClock(),
      }),
    ).rejects.toThrow('identity changed')
  })

  it('fails visibly when GitHub returns GraphQL errors despite an HTTP 200 response', async () => {
    const github = fakeGitHub([response({ errors: [{ message: 'Access denied' }] })])
    await expect(
      waitForRenovateAcknowledgement({
        ...options,
        number: 301,
        request: github.request,
        ...fakeClock(),
      }),
    ).rejects.toThrow('invalid dependency dashboard acknowledgement')
  })
})
