/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : drift/neon-admin
 * Scope        : Schema Drift Remediation — Neon control-plane adapter
 *
 * Description  : Adapter over the Neon Management API (v2) for branch
 *                lifecycle. This is the ONLY place in the drift tooling that
 *                performs Neon control-plane I/O. Provides disposable
 *                verification branches, reactivates archived branches, resets
 *                branches to their parent, and resolves the unpooled (direct)
 *                connection string used for DDL.
 *
 * Responsibilities :
 * - forkBranch       : fork a parent branch into a new disposable branch
 * - deleteBranch     : delete a branch (cleanup of verify branches)
 * - reactivate       : un-archive a branch by ensuring it has a compute endpoint
 * - resetFromParent  : restore a branch to its parent's head (== parent)
 * - connectionString : return the UNPOOLED (direct) connection URI for DDL
 *
 * Tech Stack   : TypeScript (strict), fetch + Neon Management REST API v2
 * Layer        : Data Access (control plane)
 *
 * Dependencies : ./types (BranchId)
 *
 * Notes        : The Neon API key is read from the environment
 *                (NEON_API_KEY) and is NEVER hardcoded or committed. The
 *                project id defaults to theroyalglow-db
 *                (divine-heart-60915941) and is overridable via
 *                NEON_PROJECT_ID. Branch create / delete / restore / endpoint
 *                operations are asynchronous on Neon, so each call polls the
 *                returned operations until they finish before resolving.
 ************************************************************/

import type { BranchId } from './types'

// ─────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────

const NEON_API_BASE = 'https://api.neon.tech/api/v2'

/** Default Neon project: theroyalglow-db. Overridable via NEON_PROJECT_ID. */
const DEFAULT_PROJECT_ID = 'divine-heart-60915941'

/** Neon default database / role names. Overridable via env. */
const DEFAULT_DATABASE_NAME = 'neondb'
const DEFAULT_ROLE_NAME = 'neondb_owner'

/** Operation polling tuning. */
const POLL_INTERVAL_MS = 1500
const POLL_MAX_ATTEMPTS = 120

export type NeonAdminConfig = {
  apiKey: string
  projectId: string
  databaseName: string
  roleName: string
}

/**
 * Resolve adapter configuration from the environment.
 * Throws a clear error when the API key is absent — it is never hardcoded.
 */
export function resolveNeonAdminConfig(
  env: Record<string, string | undefined> = process.env,
): NeonAdminConfig {
  const apiKey = env.NEON_API_KEY
  if (!apiKey) {
    throw new Error(
      'NEON_API_KEY is not set. Provide the Neon Management API key via the environment; it must never be hardcoded or committed.',
    )
  }

  return {
    apiKey,
    projectId: env.NEON_PROJECT_ID ?? DEFAULT_PROJECT_ID,
    databaseName: env.NEON_DATABASE_NAME ?? DEFAULT_DATABASE_NAME,
    roleName: env.NEON_ROLE_NAME ?? DEFAULT_ROLE_NAME,
  }
}

// ─────────────────────────────────────────────────────────
// Minimal Neon API response shapes (only the fields we consume).
// ─────────────────────────────────────────────────────────

type OperationStatus =
  | 'scheduling'
  | 'running'
  | 'finished'
  | 'failed'
  | 'error'
  | 'cancelling'
  | 'cancelled'
  | 'skipped'

type NeonOperation = {
  id: string
  status: OperationStatus
  action?: string
  error?: string | null
}

type NeonBranch = {
  id: string
  name?: string
  parent_id?: string | null
  state?: string
}

type NeonEndpoint = {
  id: string
  branch_id: string
  type: 'read_write' | 'read_only'
}

type BranchResponse = {
  branch: NeonBranch
  endpoints?: NeonEndpoint[]
  operations?: NeonOperation[]
}

type OperationsResponse = { operations?: NeonOperation[] }
type SingleOperationResponse = { operation: NeonOperation }
type EndpointsListResponse = { endpoints: NeonEndpoint[] }
type EndpointResponse = { endpoint: NeonEndpoint; operations?: NeonOperation[] }
type GetBranchResponse = { branch: NeonBranch }
type ConnectionUriResponse = { uri: string }

// ─────────────────────────────────────────────────────────
// NeonAdmin adapter
// ─────────────────────────────────────────────────────────

export interface NeonAdmin {
  forkBranch(parent: BranchId, name: string): Promise<BranchId>
  deleteBranch(id: BranchId): Promise<void>
  /** Un-archive an archived branch (ensures it has a live compute endpoint). */
  reactivate(id: BranchId): Promise<void>
  /** Restore a branch to its parent's head, making it == parent. */
  resetFromParent(id: BranchId): Promise<void>
  /** Return the UNPOOLED (direct) connection string for DDL. */
  connectionString(id: BranchId): Promise<string>
}

/**
 * Concrete Neon Management API adapter.
 *
 * All control-plane I/O for the drift tooling flows through this class.
 * Construct via {@link createNeonAdmin} to read config from the environment.
 */
export class NeonManagementApiAdmin implements NeonAdmin {
  private readonly config: NeonAdminConfig
  private readonly fetchImpl: typeof fetch

  constructor(config: NeonAdminConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config
    this.fetchImpl = fetchImpl
  }

  async forkBranch(parent: BranchId, name: string): Promise<BranchId> {
    const body = {
      branch: { parent_id: parent, name },
      endpoints: [{ type: 'read_write' as const }],
    }
    const res = await this.request<BranchResponse>(
      'POST',
      `/projects/${this.projectId}/branches`,
      body,
    )
    await this.waitForOperations(res.operations)
    return res.branch.id
  }

  async deleteBranch(id: BranchId): Promise<void> {
    const res = await this.request<OperationsResponse>(
      'DELETE',
      `/projects/${this.projectId}/branches/${id}`,
    )
    await this.waitForOperations(res.operations)
  }

  async reactivate(id: BranchId): Promise<void> {
    // Neon un-archives a branch automatically once it is accessed or gains a
    // live compute. We make that deterministic by ensuring the branch has a
    // read_write endpoint, creating one only when absent (idempotent).
    const existing = await this.request<EndpointsListResponse>(
      'GET',
      `/projects/${this.projectId}/branches/${id}/endpoints`,
    )
    const hasReadWrite = existing.endpoints.some((e) => e.type === 'read_write')
    if (hasReadWrite) {
      return
    }

    const created = await this.request<EndpointResponse>(
      'POST',
      `/projects/${this.projectId}/endpoints`,
      { endpoint: { branch_id: id, type: 'read_write' } },
    )
    await this.waitForOperations(created.operations)
  }

  async resetFromParent(id: BranchId): Promise<void> {
    const { branch } = await this.request<GetBranchResponse>(
      'GET',
      `/projects/${this.projectId}/branches/${id}`,
    )
    const parentId = branch.parent_id
    if (!parentId) {
      throw new Error(`Cannot resetFromParent: branch ${id} has no parent (it is a root branch).`)
    }

    // Restore the branch to the parent's current head. Omitting source_lsn /
    // source_timestamp restores to the latest state of source_branch_id.
    const res = await this.request<OperationsResponse>(
      'POST',
      `/projects/${this.projectId}/branches/${id}/restore`,
      { source_branch_id: parentId },
    )
    await this.waitForOperations(res.operations)
  }

  async connectionString(id: BranchId): Promise<string> {
    const params = new URLSearchParams({
      branch_id: id,
      database_name: this.config.databaseName,
      role_name: this.config.roleName,
      // Unpooled / direct connection required for DDL (no -pooler suffix).
      pooled: 'false',
    })
    const res = await this.request<ConnectionUriResponse>(
      'GET',
      `/projects/${this.projectId}/connection_uri?${params.toString()}`,
    )
    return res.uri
  }

  // ───────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────

  private get projectId(): string {
    return this.config.projectId
  }

  /**
   * Issue a Neon Management API request with Bearer auth.
   * Throws a clear error (status + body) on any non-2xx response.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
    }
    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const response = await this.fetchImpl(`${NEON_API_BASE}${path}`, init)
    const text = await response.text()

    if (!response.ok) {
      throw new Error(
        `Neon API ${method} ${path} failed: ${response.status} ${response.statusText} — ${text || '<empty body>'}`,
      )
    }

    // 204 No Content (or otherwise empty) — nothing to parse.
    if (text.length === 0) {
      return {} as T
    }

    try {
      return JSON.parse(text) as T
    } catch (cause) {
      throw new Error(
        `Neon API ${method} ${path} returned unparseable JSON (status ${response.status}): ${text}`,
        { cause },
      )
    }
  }

  /** Poll the supplied operations until all finish, or throw on failure. */
  private async waitForOperations(operations: NeonOperation[] | undefined): Promise<void> {
    if (!operations || operations.length === 0) {
      return
    }
    for (const op of operations) {
      await this.waitForOperation(op)
    }
  }

  private async waitForOperation(operation: NeonOperation): Promise<void> {
    let current = operation
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      if (current.status === 'finished' || current.status === 'skipped') {
        return
      }
      if (
        current.status === 'failed' ||
        current.status === 'error' ||
        current.status === 'cancelled'
      ) {
        throw new Error(
          `Neon operation ${current.id} (${current.action ?? 'unknown'}) ended as ${current.status}: ${current.error ?? 'no error detail'}`,
        )
      }

      await sleep(POLL_INTERVAL_MS)
      const res = await this.request<SingleOperationResponse>(
        'GET',
        `/projects/${this.projectId}/operations/${current.id}`,
      )
      current = res.operation
    }

    throw new Error(
      `Neon operation ${current.id} (${current.action ?? 'unknown'}) did not finish after ${POLL_MAX_ATTEMPTS} polls; last status: ${current.status}`,
    )
  }
}

/** Construct a {@link NeonAdmin} using configuration resolved from the environment. */
export function createNeonAdmin(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): NeonAdmin {
  return new NeonManagementApiAdmin(resolveNeonAdminConfig(env), fetchImpl)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
