/************************************************************
 * Module Name  : e2e/fixtures/admin-api
 * Scope        : Admin E2E — reading admin APIs from a test
 *
 * Description  : Typed calls to the admin JSON APIs, made with a page's
 *                request context so they share the page's cookies (the
 *                session and the active-branch choice). Specs read the
 *                server's answer first and then check the screen against
 *                it, so they hold for whatever data the target has.
 *
 * Notes        : Read-only helpers, apart from switchBranch, which changes
 *                only the browser context's branch cookie.
 ************************************************************/
import { type APIRequestContext, type APIResponse, expect } from '@playwright/test'

/** A branch the person can work in (GET /api/me/branch). */
export type SwitcherBranch = {
  id: string
  name: string
  code: string
  status: string
  isPrimary: boolean
  role: 'staff' | 'receptionist' | 'manager' | 'owner' | 'developer'
}

export type MyBranches = { active: SwitcherBranch | null; branches: SwitcherBranch[] }

export type Person = { id: string; name: string; email: string; phone: string | null }

/** GET /api/users/branch-roles */
export type BranchRoles = {
  branch: { id: string; name: string; code: string; status: string }
  owner: Person | null
  manager: Person | null
  receptionist: Person | null
  can: { setOwner: boolean; setManager: boolean; setReceptionist: boolean }
}

/** One row of GET /api/staff/all */
export type StaffRow = Person & {
  userId: string
  designation: 'receptionist' | 'stylist' | 'therapist' | 'manager'
  roleWitness: 'staff' | 'receptionist' | 'manager' | null
  specialization: string | null
  canEdit: boolean
  canRemove: boolean
}

export type StaffPage = { branch: { id: string; name: string; code: string }; staff: StaffRow[] }

/** What both a request-context response and a page's network response offer. */
type JsonResponse = Pick<APIResponse, 'ok' | 'status' | 'url' | 'json'>

/** The `data` of a success envelope; fails the test with the server's error otherwise. */
export async function data<T>(response: JsonResponse): Promise<T> {
  const json = await response.json().catch(() => null)
  const error = json?.error ? ` ${json.error.code}: ${json.error.message}` : ''
  expect(response.ok(), `${response.url()} answered ${response.status()}${error}`).toBe(true)
  expect(json?.success, `${response.url()} did not return a success envelope`).toBe(true)
  return json.data as T
}

/** The error code of a failed response. */
export async function errorCode(response: JsonResponse): Promise<string | undefined> {
  const json = await response.json().catch(() => null)
  return json?.error?.code
}

export async function myBranches(request: APIRequestContext): Promise<MyBranches> {
  return data<MyBranches>(await request.get('/api/me/branch'))
}

/** The active branch; fails when the account can't work in any. */
export async function activeBranch(request: APIRequestContext): Promise<SwitcherBranch> {
  const { active } = await myBranches(request)
  expect(active, 'the signed-in account works in no branch').not.toBeNull()
  return active as SwitcherBranch
}

/** Switch this browser context's active branch (cookie only, no data changes). */
export async function switchBranch(
  request: APIRequestContext,
  branchId: string,
): Promise<SwitcherBranch> {
  const { active } = await data<{ active: SwitcherBranch }>(
    await request.put('/api/me/branch', { data: { branchId } }),
  )
  return active
}

export async function branchRoles(request: APIRequestContext): Promise<BranchRoles> {
  return data<BranchRoles>(await request.get('/api/users/branch-roles'))
}

export async function staffPage(request: APIRequestContext): Promise<StaffPage> {
  return data<StaffPage>(await request.get('/api/staff/all'))
}

/** Escape text for use inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
