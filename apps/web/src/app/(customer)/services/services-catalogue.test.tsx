/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 09-06-2026 & Updated - 09-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServicesCatalogue (component test)
 * Scope        : Customer Pages — Services UI Wiring
 *
 * Description  : Component tests for the services catalogue surface. Verifies
 *                it sources data from GET /api/services, shows a loading state
 *                while the request is pending, and shows an error state with a
 *                retry control on failure (and recovers on retry).
 *
 * Tech Stack   : Vitest, @testing-library/react, jsdom, MSW
 * Layer        : Testing (Presentation / Component)
 *
 * Notes        :
 * - Validates: Requirements 13.1, 13.2, 13.3
 * - The endpoint is mocked with MSW (already configured for the web project);
 *   no real network access occurs.
 ************************************************************/

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { server } from '@/test/msw-server'
import { ServicesCatalogue } from './services-catalogue'

// A salon category with one service, matching the GET /api/services envelope.
function catalogue() {
  return {
    categories: [
      {
        id: 'cat_hair',
        name: 'Hair & Styling',
        serviceType: 'salon',
        displayOrder: 1,
        services: [
          {
            id: 'svc_cut',
            categoryId: 'cat_hair',
            categoryName: 'Hair & Styling',
            name: 'Signature Haircut',
            slug: 'signature-haircut',
            durationMinutes: 45,
            pricePaise: 80000,
            gemsRedeemable: false,
            gemsRequired: null,
          },
        ],
      },
    ],
  }
}

afterEach(() => {
  cleanup()
})

describe('ServicesCatalogue UI wiring (Req 13)', () => {
  it('sources categories and services from GET /api/services (13.1)', async () => {
    server.use(
      http.get('*/api/services', () => HttpResponse.json({ success: true, data: catalogue() })),
    )

    render(<ServicesCatalogue />)

    // The rendered service comes from the API response, not hard-coded markup.
    expect(await screen.findByText('Hair & Styling')).toBeInTheDocument()
    expect(screen.getByText('Signature Haircut')).toBeInTheDocument()
  })

  it('presents a loading state while the catalogue request is pending (13.2)', () => {
    server.use(
      // Never resolves within the test — keeps the request pending.
      http.get('*/api/services', () => new Promise<never>(() => {})),
    )

    render(<ServicesCatalogue />)

    expect(screen.getByText('Loading our services…')).toBeInTheDocument()
  })

  it('presents an error state with a working retry control on failure (13.3)', async () => {
    let attempts = 0
    server.use(
      http.get('*/api/services', () => {
        attempts += 1
        // Fail the first request, succeed once the user retries.
        if (attempts === 1) {
          return HttpResponse.json(
            {
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Could not load our services.' },
            },
            { status: 500 },
          )
        }
        return HttpResponse.json({ success: true, data: catalogue() })
      }),
    )

    render(<ServicesCatalogue />)

    // Error state surfaces with a retry affordance.
    const retry = await screen.findByRole('button', { name: /try again/i })
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load our services.')

    // Retrying re-requests and renders the recovered catalogue.
    fireEvent.click(retry)

    expect(await screen.findByText('Signature Haircut')).toBeInTheDocument()
    await waitFor(() => expect(attempts).toBe(2))
  })
})
