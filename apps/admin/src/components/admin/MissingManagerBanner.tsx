/************************************************************
 * Module Name  : MissingManagerBanner
 * Scope        : Admin Portal — Dashboard (multi-branch R1.9)
 *
 * Description  : Says that the active branch has no Manager. The branch's
 *                Owner and the Developer get a link to assign one in Users &
 *                Roles; everyone else learns that the Owner covers until then.
 *                Presentation only: missingManagerNotice() decides.
 ************************************************************/

import { TriangleAlert, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { MissingManagerNotice } from '@/lib/branches/missing-manager'

export function MissingManagerBanner({ notice }: { notice: MissingManagerNotice }) {
  return (
    <section
      aria-labelledby="missing-manager-title"
      className="flex flex-col gap-3 rounded-cards border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h2
          id="missing-manager-title"
          className="flex items-center gap-2 font-ui text-sm text-cocoa-dark"
        >
          <Icon icon={TriangleAlert} decorative size={16} className="text-deep-gold" />
          {notice.branchName} has no Manager
        </h2>
        <p className="mt-1 font-sans text-sm text-warm-gray">
          {notice.canAssign
            ? 'Assign one in Users & Roles. Until then you cover the branch’s administration.'
            : 'The branch Owner covers its administration until a Manager is assigned.'}
        </p>
      </div>
      {notice.canAssign ? (
        <Button asChild size="sm" variant="outline" className="shrink-0 font-ui">
          <Link href="/users">
            <Icon icon={UserPlus} decorative size={16} />
            Assign a Manager
          </Link>
        </Button>
      ) : null}
    </section>
  )
}
