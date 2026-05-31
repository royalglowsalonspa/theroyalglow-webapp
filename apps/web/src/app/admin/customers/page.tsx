import type { Metadata } from 'next'
import { CustomersTable } from './customers-table'

export const metadata: Metadata = {
  title: 'Customers',
}

export default function CustomersPage() {
  return <CustomersTable />
}
