import {
  getMembershipById,
  getServicesForAdmin,
  listStaffForHistoricalSession,
} from '@rgss/db/queries'
import { notFound } from 'next/navigation'
import { requireBranchRole } from '@/lib/api/branch-context'
import { HistoricalSessionForm } from './historical-session-form'

export default async function HistoricalSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { branch } = await requireBranchRole('developer')
  const { id } = await params
  const [membership, services, staff] = await Promise.all([
    getMembershipById(id),
    getServicesForAdmin(),
    listStaffForHistoricalSession(),
  ])
  if (!membership || membership.status === 'cancelled') notFound()

  return (
    <HistoricalSessionForm
      membershipId={id}
      membershipNumber={membership.membershipNumber}
      branchId={branch.id}
      branchName={branch.name}
      staff={staff}
      services={services.filter((service) => service.serviceType === 'spa')}
    />
  )
}
