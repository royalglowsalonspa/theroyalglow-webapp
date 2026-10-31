/************************************************************
 * Module Name  : driver-errors
 * Scope        : Data Access — Postgres error classification
 *
 * Description  : Recognises the database errors that a write path turns into
 *                a business outcome instead of a 500: a failed guard
 *                (`1 / count(*)` dividing by zero), a unique, foreign-key or
 *                check violation on a named constraint, and a deadlock.
 *
 * Notes        : A neon-http batch surfaces the driver error directly, but
 *                Drizzle 0.45 may wrap it in a DrizzleQueryError whose own
 *                `.code` is undefined, with the Postgres error on `.cause`.
 *                Every predicate therefore walks a bounded `cause` chain.
 ************************************************************/

/** Postgres SQLSTATE codes the data layer reacts to. */
export const SQLSTATE = {
  divisionByZero: '22012',
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  // ON DELETE RESTRICT raises this, not 23503.
  restrictViolation: '23001',
  checkViolation: '23514',
  // An exclusion constraint, such as a person booked twice at once (0028).
  exclusionViolation: '23P01',
  deadlockDetected: '40P01',
} as const

// How far down an error's `cause` chain to look; bounded so a cycle can't hang.
const MAX_CAUSE_DEPTH = 5

export type DriverErrorLike = {
  code?: unknown
  constraint?: unknown
  message?: unknown
  cause?: unknown
}

/** The first error in the cause chain whose SQLSTATE is one of `sqlStates`. */
export function findDriverError(
  error: unknown,
  sqlStates: readonly string[],
): DriverErrorLike | null {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return null
    }
    const e = current as DriverErrorLike
    if (typeof e.code === 'string' && sqlStates.includes(e.code)) {
      return e
    }
    current = e.cause
  }
  return null
}

/**
 * True when a guard aborted the transaction: `1 / count(*)` divided by zero
 * because the row it checks didn't match. Falls back to the message, because
 * some wrappers drop the SQLSTATE.
 */
export function isGuardAbort(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false
    }
    const e = current as DriverErrorLike
    if (e.code === SQLSTATE.divisionByZero) {
      return true
    }
    if (typeof e.message === 'string' && e.message.toLowerCase().includes('division by zero')) {
      return true
    }
    current = e.cause
  }
  return false
}

/**
 * True when the error is `sqlState` on one of `constraints`. The constraint
 * name comes from the driver's `.constraint` field when present, else from the
 * message, so another constraint's violation is never mistaken for this one.
 */
export function isConstraintViolation(
  error: unknown,
  sqlState: string,
  constraints: readonly string[],
): boolean {
  const e = findDriverError(error, [sqlState])
  if (!e) {
    return false
  }
  if (typeof e.constraint === 'string') {
    return constraints.includes(e.constraint)
  }
  const message = typeof e.message === 'string' ? e.message : ''
  return constraints.some((name) => message.includes(`"${name}"`))
}
