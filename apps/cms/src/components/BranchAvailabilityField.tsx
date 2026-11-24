'use client'
/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : BranchAvailabilityField
 * Scope        : CMS Admin — custom field component
 *
 * Description  : Checkbox list for a category's or service's "Selected
 *                branches" (catalogue-availability.md). Branches live in the
 *                application schema, so it lists them from
 *                GET /api/catalogue-branches and stores the chosen branch ids
 *                in the `availableBranches` text (hasMany) field.
 *
 * Responsibilities :
 * - Load the branch list; show a retry when it fails
 * - One checkbox per branch, with its status when not operational
 * - Keep a chosen branch visible even when it is shut down or unknown, so
 *   it can be unticked
 *
 * Tech Stack   : React 19, Payload CMS v3 (@payloadcms/ui)
 * Layer        : CMS (Admin component)
 *
 * Dependencies : @payloadcms/ui, payload (types), react
 *
 * Notes        : Registered by path in `src/lib/catalogue-fields.ts`; run
 *                `bunx payload generate:importmap` after moving it.
 *                Validation (at least one branch, ids exist) runs on the
 *                server on save.
 ************************************************************/
import { FieldDescription, FieldError, FieldLabel, useConfig, useField } from '@payloadcms/ui'
import type { TextFieldClientComponent } from 'payload'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { branchOptions, type CatalogueBranch } from './branch-options'

export const BranchAvailabilityField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { value, setValue, showError, errorMessage, disabled } = useField<string[] | null>({
    path,
  })
  const { config } = useConfig()
  const [branches, setBranches] = useState<CatalogueBranch[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const groupId = useId()

  useEffect(() => {
    // `attempt` re-runs the request after a failure.
    void attempt
    let cancelled = false
    setLoadError(null)
    fetch(`${config.routes.api}/catalogue-branches`, { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as {
          branches?: CatalogueBranch[]
          errors?: { message?: string }[]
        } | null
        if (!res.ok || !json?.branches) {
          throw new Error(json?.errors?.[0]?.message ?? 'Could not load the branches.')
        }
        return json.branches
      })
      .then((list) => {
        if (!cancelled) setBranches(list)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load the branches.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [config.routes.api, attempt])

  const selected = useMemo(() => new Set(Array.isArray(value) ? value : []), [value])
  const options = useMemo(
    () => (branches ? branchOptions(branches, selected) : []),
    [branches, selected],
  )
  const isReadOnly = Boolean(readOnly) || disabled

  const toggle = useCallback(
    (id: string, checked: boolean) => {
      const next = new Set(selected)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      setValue([...next].sort())
    },
    [selected, setValue],
  )

  const label = field.label ?? 'Branches'
  const description =
    typeof field.admin?.description === 'string' ? field.admin.description : undefined

  return (
    <div className="field-type" style={{ marginBottom: 'var(--base, 20px)' }}>
      <FieldLabel as="span" label={label} path={path} required />
      <fieldset
        aria-labelledby={`${groupId}-legend`}
        style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}
      >
        <legend id={`${groupId}-legend`} style={{ position: 'absolute', left: '-9999px' }}>
          {typeof label === 'string' ? label : 'Branches'}
        </legend>
        {loadError ? (
          <p role="alert">
            {loadError}{' '}
            <button type="button" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          </p>
        ) : branches === null ? (
          <p aria-live="polite">Loading branches…</p>
        ) : options.length === 0 ? (
          <p>No branches yet. Add one in the admin portal first.</p>
        ) : (
          options.map((option) => {
            const inputId = `${groupId}-${option.id}`
            return (
              <label
                key={option.id}
                htmlFor={inputId}
                style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={selected.has(option.id)}
                  disabled={isReadOnly}
                  onChange={(event) => toggle(option.id, event.target.checked)}
                />
                {option.label}
              </label>
            )
          })
        )}
      </fieldset>
      <FieldError
        {...(errorMessage ? { message: errorMessage } : {})}
        path={path}
        showError={showError}
      />
      {description ? <FieldDescription description={description} path={path} /> : null}
    </div>
  )
}
