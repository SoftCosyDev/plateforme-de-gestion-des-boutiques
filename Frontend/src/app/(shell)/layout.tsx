import AppShell from '@/components/app-shell'
import AuthGate from '@/components/auth-gate'

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  )
}
