export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50/50 to-white">
      <div className="w-full max-w-md px-4">
        {children}
      </div>
    </div>
  )
}
