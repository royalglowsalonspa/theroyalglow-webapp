// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Standalone Actions script; never cached by Turbo.
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type RecordValue = Record<string, unknown>
export type DashboardIssue = {
  number: number
  title: string
  body: string
  state: string
  updatedAt: string
  author: string
  authorType: string
  isPullRequest: boolean
}
export type GitHubRequest = (url: string, init: RequestInit) => Promise<Response>
type Options = { repository: string; token: string; title: string; request?: GitHubRequest }
type AcknowledgementOptions = Options & {
  number: number
  timeoutMs?: number
  intervalMs?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}

const BOT = 'renovate[bot]'
const MANUAL_MARKER = '<!-- manual job -->'
const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseIssue(value: unknown): DashboardIssue {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.number) ||
    typeof value.number !== 'number' ||
    value.number <= 0 ||
    typeof value.title !== 'string' ||
    (typeof value.body !== 'string' && value.body !== null) ||
    typeof value.state !== 'string' ||
    typeof value.updated_at !== 'string' ||
    !isRecord(value.user) ||
    typeof value.user.login !== 'string' ||
    typeof value.user.type !== 'string'
  ) {
    throw new Error('GitHub returned an invalid dependency dashboard issue.')
  }
  return {
    number: value.number,
    title: value.title,
    body: value.body ?? '',
    state: value.state,
    updatedAt: value.updated_at,
    author: value.user.login,
    authorType: value.user.type,
    isPullRequest: value.pull_request !== undefined,
  }
}

export function selectDashboard(issues: DashboardIssue[], title: string): DashboardIssue {
  const matches = issues.filter(
    (issue) =>
      issue.author === BOT &&
      issue.authorType === 'Bot' &&
      issue.title === title &&
      issue.state === 'open' &&
      !issue.isPullRequest,
  )
  const dashboard = matches[0]
  if (matches.length !== 1 || !dashboard) {
    throw new Error(
      `Expected exactly one open ${BOT} dashboard titled ${title}; found ${matches.length}.`,
    )
  }
  return dashboard
}

function manualControl(body: string) {
  const markerCount = body.split(MANUAL_MARKER).length - 1
  const control = /^- \[([ xX])\] <!-- manual job -->[^\r\n]*\r?$/gm
  const matches = [...body.matchAll(control)]
  const match = matches[0]
  if (markerCount !== 1 || matches.length !== 1 || !match) {
    throw new Error('Dependency dashboard has no unique native manual-run checkbox.')
  }
  return { pending: match[1] !== ' ', checkboxOffset: match.index + '- ['.length }
}

export function requestBody(body: string): string {
  const { pending, checkboxOffset } = manualControl(body)
  if (pending) return body
  // Replace one character, preserving every approval, rebase, heading and newline.
  return `${body.slice(0, checkboxOffset)}x${body.slice(checkboxOffset + 1)}`
}

function unchanged(first: DashboardIssue, current: DashboardIssue): boolean {
  return (
    first.number === current.number &&
    first.title === current.title &&
    first.author === current.author &&
    first.authorType === current.authorType &&
    first.state === current.state &&
    first.isPullRequest === current.isPullRequest &&
    first.updatedAt === current.updatedAt &&
    first.body === current.body
  )
}

function githubClient({ repository, token, title, request = fetch }: Options) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token || !title) {
    throw new Error('Repository, dashboard title and GITHUB_TOKEN are required.')
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
  return async (url: string, init: RequestInit = {}) => {
    const response = await request(url, {
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
      ...init,
      headers: { ...headers, ...init.headers },
    })
    if (!response.ok && response.status !== 409 && response.status !== 412) {
      throw new Error(`GitHub dependency dashboard request failed with HTTP ${response.status}.`)
    }
    return response
  }
}

export async function requestRenovateRun(options: Options) {
  const { repository, title } = options
  const send = githubClient(options)
  const endpoint = `https://api.github.com/repos/${repository}/issues`
  const issues: DashboardIssue[] = []
  for (let page = 1; page <= 100; page++) {
    const query = new URLSearchParams({
      state: 'open',
      creator: BOT,
      per_page: '100',
      page: String(page),
    })
    const response = await send(`${endpoint}?${query}`)
    if (!response.ok)
      throw new Error(`Could not list Renovate dashboards: HTTP ${response.status}.`)
    const values: unknown = await response.json()
    if (!Array.isArray(values)) throw new Error('GitHub returned an invalid issue listing.')
    issues.push(...values.map(parseIssue))
    if (values.length < 100) break
    if (page === 100)
      throw new Error('Renovate issue listing exceeded the pagination safety limit.')
  }
  const selected = selectDashboard(issues, title)
  const issueEndpoint = `${endpoint}/${selected.number}`
  const result = {
    number: selected.number,
    url: `https://github.com/${repository}/issues/${selected.number}`,
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const original = await send(issueEndpoint)
    if (!original.ok)
      throw new Error(`Could not read dependency dashboard: HTTP ${original.status}.`)
    const dashboard = selectDashboard([parseIssue(await original.json())], title)
    if (dashboard.number !== selected.number)
      throw new Error('GitHub returned a different dashboard.')
    const body = requestBody(dashboard.body)
    if (body === dashboard.body) return { ...result, state: 'already-requested' }
    // Re-read immediately before writing. Regenerate from the newest body if the
    // bot or a maintainer changed it, rather than overwriting their approvals.
    const fresh = await send(issueEndpoint)
    if (!fresh.ok) throw new Error(`Could not re-read dependency dashboard: HTTP ${fresh.status}.`)
    const current = selectDashboard([parseIssue(await fresh.json())], title)
    if (!unchanged(dashboard, current)) continue
    const etag = fresh.headers.get('etag')
    const response = await send(issueEndpoint, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        // Weak validators cannot satisfy If-Match under HTTP semantics.
        ...(etag && !etag.startsWith('W/') ? { 'If-Match': etag } : {}),
      },
      body: JSON.stringify({ body }),
    })
    if (response.status === 409 || response.status === 412) continue
    const updated = selectDashboard([parseIssue(await response.json())], title)
    if (updated.number !== selected.number || updated.body !== body) {
      throw new Error('GitHub did not return the requested dashboard checkbox update.')
    }
    return { ...result, state: 'requested' }
  }
  throw new Error(
    'Dependency dashboard changed repeatedly. Retry after the active hosted Renovate run finishes.',
  )
}

function acknowledgement(value: unknown, number: number, title: string): boolean {
  if (
    !isRecord(value) ||
    value.errors !== undefined ||
    !isRecord(value.data) ||
    !isRecord(value.data.repository) ||
    !isRecord(value.data.repository.issue)
  ) {
    throw new Error('GitHub returned an invalid dependency dashboard acknowledgement.')
  }
  const issue = value.data.repository.issue
  // GraphQL represents Bot.login without REST's [bot] suffix.
  if (
    issue.number !== number ||
    issue.title !== title ||
    issue.state !== 'OPEN' ||
    typeof issue.body !== 'string' ||
    !isRecord(issue.author) ||
    issue.author.login !== 'renovate' ||
    issue.author.__typename !== 'Bot'
  ) {
    throw new Error(
      'Dependency dashboard identity changed while waiting for hosted acknowledgement.',
    )
  }
  const pending = manualControl(issue.body).pending
  return (
    !pending &&
    isRecord(issue.editor) &&
    issue.editor.login === 'renovate' &&
    issue.editor.__typename === 'Bot'
  )
}

export async function waitForRenovateAcknowledgement({
  number,
  timeoutMs = 15 * 60_000,
  intervalMs = 30_000,
  now = Date.now,
  sleep = (milliseconds) =>
    new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  ...options
}: AcknowledgementOptions): Promise<void> {
  if (
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    !Number.isFinite(timeoutMs) ||
    !Number.isFinite(intervalMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 15 * 60_000 ||
    intervalMs <= 0
  ) {
    throw new Error('Invalid hosted acknowledgement bounds.')
  }
  const send = githubClient(options)
  const [owner, name] = options.repository.split('/')
  const deadline = now() + timeoutMs
  const query = `query DashboardAcknowledgement($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) { number title state body author { login __typename } editor { login __typename } }
    }
  }`
  while (true) {
    const response = await send('https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner, name, number } }),
    })
    if (!response.ok)
      throw new Error(`Could not read hosted acknowledgement: HTTP ${response.status}.`)
    if (acknowledgement(await response.json(), number, options.title)) return
    const remaining = deadline - now()
    if (remaining <= 0) {
      throw new Error(
        'Hosted Renovate did not acknowledge the dashboard request within 15 minutes. Check the Mend job queue and GitHub App installation.',
      )
    }
    await sleep(Math.min(intervalMs, remaining))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.env.GITHUB_REF !== 'refs/heads/prod')
      throw new Error('Scheduled Renovate requests must run from prod.')
    const config: unknown = JSON.parse(readFileSync('.github/renovate.json', 'utf8'))
    if (!isRecord(config) || typeof config.dependencyDashboardTitle !== 'string') {
      throw new Error('Renovate configuration must declare a dependency dashboard title.')
    }
    const options = {
      repository: process.env.GITHUB_REPOSITORY ?? '',
      token: process.env.GITHUB_TOKEN ?? '',
      title: config.dependencyDashboardTitle,
    }
    const result = await requestRenovateRun(options)
    console.log(
      `${result.state === 'requested' ? 'Requested' : 'Already requested'} a hosted Renovate check using dashboard #${result.number}; waiting for acknowledgement.`,
    )
    await waitForRenovateAcknowledgement({ ...options, number: result.number })
    const message = `Hosted Renovate acknowledged the request on dashboard #${result.number}. Check its job results for dependency scan completion.`
    console.log(message)
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `${message} [Open dashboard](${result.url}).\n`,
      )
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Could not request hosted Renovate check.',
    )
    process.exitCode = 1
  }
}
