/************************************************************
 * Module Name  : CatalogueSyncPanel (component test)
 * Scope        : Admin Portal — Integrations (Developer), catalogue resync
 *                (multi-branch R4.7, catalogue-resync.md)
 *
 * Description  : The panel lists each record that differs from the CMS,
 *                with a Resync action only where one can repair it; a resync
 *                posts the record with the CMS revision it was shown, says
 *                what happened and loads the report again; in sync, it says so.
 *
 * Notes        : `fetch` is stubbed on the global.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogueSyncPanel, type DriftRecord } from './catalogue-sync-panel'

const REVISION = '2026-11-21T06:00:00.000Z'

const RECORDS: DriftRecord[] = [
  {
    table: 'service_category',
    id: 'cat_old',
    name: 'Old category',
    kind: 'extra',
    differences: [],
    cmsUpdatedAt: null,
    repairable: false,
  },
  {
    table: 'service',
    id: 'svc_cut',
    name: 'Haircut',
    kind: 'different',
    differences: [{ field: 'pricePaise', cmsValue: '50000', publicValue: '45000' }],
    cmsUpdatedAt: REVISION,
    repairable: true,
  },
]

let report: DriftRecord[] = RECORDS
let posted: unknown[] = []

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
})

beforeEach(() => {
  report = RECORDS
  posted = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted.push(JSON.parse(String(init.body)))
        report = [RECORDS[0] as DriftRecord]
        return ok({
          findingCount: 1,
          results: [
            {
              table: 'service',
              id: 'svc_cut',
              cmsUpdatedAt: REVISION,
              outcome: 'updated',
              message: null,
              remaining: { kind: null, differences: [] },
            },
          ],
        })
      }
      return ok({ checkedAt: REVISION, findingCount: report.length, records: report })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CatalogueSyncPanel', () => {
  it('offers a resync only where the CMS row can repair the record', async () => {
    render(<CatalogueSyncPanel />)

    const table = await screen.findByRole('table', {
      name: 'Catalogue records that differ from the CMS',
    })
    expect(within(table).getByText('pricePaise: CMS 50000, app 45000')).toBeInTheDocument()
    expect(
      within(table).getByText(/Not in the CMS: recreate or retire it there/),
    ).toBeInTheDocument()
    expect(within(table).getByText('Fix in the CMS')).toBeInTheDocument()
    expect(within(table).getAllByRole('button', { name: /^Resync / })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Resync all (1)' })).toBeInTheDocument()
  })

  it('resyncs a record at the revision it was shown, says what happened and checks again', async () => {
    render(<CatalogueSyncPanel />)

    fireEvent.click(await screen.findByRole('button', { name: 'Resync Haircut' }))

    expect(
      await screen.findByText('Haircut (service svc_cut): updated from the CMS.'),
    ).toBeInTheDocument()
    expect(posted).toEqual([
      { records: [{ table: 'service', id: 'svc_cut', cmsUpdatedAt: REVISION }] },
    ])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Resync Haircut' })).toBeNull())
    expect(screen.getByText('Old category')).toBeInTheDocument()
  })

  it('says when the catalogue is in sync', async () => {
    report = []
    render(<CatalogueSyncPanel />)
    expect(await screen.findByText("The app's catalogue matches the CMS.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Resync all/ })).toBeNull()
  })
})
