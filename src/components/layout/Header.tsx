import { LogOut, Menu, Search, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'

interface HeaderProps {
  title: string
  icon?: LucideIcon
  onMenuClick: () => void
}

export function Header({ title, icon: Icon, onMenuClick }: HeaderProps) {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-navy/10 bg-navy px-3 text-white">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-lg p-2 hover:bg-white/10"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
        {Icon && <Icon className="h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} />}
        <h1 className="truncate text-base font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate('/buscar')}
          className="rounded-lg p-2 hover:bg-white/10"
          aria-label="Buscar"
        >
          <Search className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-lg p-2 hover:bg-white/10"
          aria-label="Sair"
        >
          <LogOut className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>
    </header>
  )
}
