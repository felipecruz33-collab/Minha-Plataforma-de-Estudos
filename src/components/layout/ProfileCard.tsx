import { Crown, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth/AuthContext'

export function ProfileCard({ onNavigate }: { onNavigate?: () => void }) {
  const { perfil } = useAuth()
  if (!perfil) return null

  const nomeExibido = perfil.nome.trim() || perfil.email
  const inicial = (perfil.nome.trim() || perfil.email).charAt(0).toUpperCase()

  return (
    <Link
      to="/perfil"
      onClick={onNavigate}
      className="flex items-center gap-3 border-t border-white/10 px-4 py-3 hover:bg-white/5"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white">
        {inicial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{nomeExibido}</p>
        <p className="truncate text-xs text-slate-400">{perfil.email}</p>
      </div>
      {perfil.isAdmin && <Shield className="h-4 w-4 shrink-0 text-brand-blue" strokeWidth={1.75} />}
      {perfil.isPremium && !perfil.isAdmin && <Crown className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.75} />}
    </Link>
  )
}
