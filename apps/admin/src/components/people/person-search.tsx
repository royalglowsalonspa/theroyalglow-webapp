/************************************************************
 * Module Name  : PersonSearch
 * Scope        : Admin Portal — people administration (multi-branch R1.11)
 *
 * Description  : Find one existing account by name, phone or email. Used by
 *                Users & Roles (choosing an Owner, Manager or Receptionist)
 *                and by Add staff. The caller supplies the lookup and decides
 *                which matches can be picked; a match that can't be shows why.
 *
 * Features / Functionality :
 * - Debounced lookup from 3 characters (PERSON_SEARCH_MIN_LENGTH); a newer
 *   keystroke aborts the request in flight so stale results never win
 * - Up to 10 matches, each with name, email and phone
 * - Results announced through aria-live; errors through role="alert"
 *
 * Tech Stack   : React (Client Component), TypeScript
 * Layer        : Presentation
 *
 * Notes        : A person without an account isn't found: they sign in once
 *                at theroyalglow.in, which creates it.
 ************************************************************/

'use client'

import { PERSON_SEARCH_MIN_LENGTH } from '@rgss/types'
import { cn } from '@rgss/ui/lib/utils'
import { Search } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'

/** The identity every match carries. */
export type PersonMatch = { id: string; name: string; email: string; phone: string | null }

/** Debounce between the last keystroke and the lookup request. */
const SEARCH_DEBOUNCE_MS = 300

const FIELD_LABEL = 'mb-1 block font-ui text-[11px] uppercase tracking-wider text-dusty-gray'

export function personLabel(person: { name: string; email: string }): string {
  return person.name || person.email
}

export function PersonSearch<T extends PersonMatch>({
  label = 'Find a person',
  search,
  status,
  onPick,
  disabled = false,
}: {
  label?: string
  /** Look people up; rejects with a message to show. */
  search: (term: string, signal: AbortSignal) => Promise<T[]>
  /** Whether a match can be picked, and the short text shown beside it. */
  status: (match: T) => { pickable: boolean; text: string | null }
  onPick: (match: T) => void
  disabled?: boolean
}) {
  const ids = useId()
  const inputId = `${ids}-search`
  const hintId = `${ids}-hint`

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<T[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const term = query.trim()
    if (term.length < PERSON_SEARCH_MIN_LENGTH) {
      setResults([])
      setSearching(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    setSearching(true)
    setError(null)
    const handle = setTimeout(async () => {
      try {
        setResults(await search(term, controller.signal))
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          return
        }
        setResults([])
        setError(err instanceof Error ? err.message : 'Could not search accounts.')
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(handle)
    }
  }, [query, search])

  return (
    <div>
      <label htmlFor={inputId} className={FIELD_LABEL}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-dusty-gray">
          <Icon icon={Search} decorative size={16} />
        </span>
        <Input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // Inside a form, Enter would submit it before anyone is chosen.
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
            }
          }}
          placeholder="Search by name, phone, or email…"
          autoComplete="off"
          aria-describedby={hintId}
          disabled={disabled}
          className="pl-8"
        />
      </div>
      <p id={hintId} className="mt-1 font-sans text-xs text-dusty-gray">
        Type at least {PERSON_SEARCH_MIN_LENGTH} characters. Up to 10 matching accounts are shown.
      </p>

      <div aria-live="polite">
        {searching ? (
          <p className="px-1 py-2 font-sans text-xs text-dusty-gray">Searching…</p>
        ) : error ? (
          <p className="px-1 py-2 font-sans text-xs text-error" role="alert">
            {error}
          </p>
        ) : results.length > 0 ? (
          <ul className="mt-1 divide-y divide-cloud-gray overflow-hidden rounded-cards border border-cloud-gray">
            {results.map((match) => {
              const { pickable, text } = status(match)
              return (
                <li key={match.id}>
                  <button
                    type="button"
                    onClick={() => onPick(match)}
                    disabled={!pickable || disabled}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors motion-reduce:transition-none',
                      pickable ? 'hover:bg-cloud-gray' : 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-sans text-sm text-cocoa-dark">
                        {personLabel(match)}
                      </span>
                      <span className="block truncate font-sans text-xs text-dusty-gray">
                        {match.phone ? `${match.email} · ${match.phone}` : match.email}
                      </span>
                    </span>
                    {text ? (
                      <span className="shrink-0 font-ui text-xs text-warm-gray">{text}</span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : query.trim().length >= PERSON_SEARCH_MIN_LENGTH ? (
          <p className="px-1 py-2 font-sans text-xs text-dusty-gray">
            No matching accounts. They may need to sign in on theroyalglow.in first.
          </p>
        ) : null}
      </div>
    </div>
  )
}
