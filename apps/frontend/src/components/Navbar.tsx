import { Button } from '@/components/ui/button'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { logout } = useAuth()

  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b bg-white">
      <span className="font-semibold text-sm">Recruitment Platform</span>
      <Button variant="ghost" size="sm" onClick={logout}>
        Logout
      </Button>
    </nav>
  )
}
