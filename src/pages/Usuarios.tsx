import { AlertTriangle, Crown, Lock, Shield, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, usingSupabase } from '../lib/repo'
import type { Perfil } from '../lib/types'

export default function Usuarios() {
  const { perfil } = useAuth()
  const [perfis, setPerfis] = useState<Perfil[] | null>(null)

  useEffect(() => {
    if (!perfil?.isAdmin) return
    repo.listPerfis().then(setPerfis)
  }, [perfil?.isAdmin])

  if (!perfil?.isAdmin) {
    return <EmptyState icon={Lock} title="Esta tela é exclusiva do administrador" />
  }

  return (
    <div>
      {!usingSupabase && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          <p>
            Modo local (sem Supabase conectado): esta lista mostra só as contas criadas{' '}
            <strong>neste navegador/aparelho</strong>, não todos os usuários reais do app. Conecte
            o Supabase para ver a lista completa e de verdade.
          </p>
        </div>
      )}

      <p className="mb-4 text-sm text-slate-500">
        <span className="font-semibold text-navy">{perfis?.length ?? 0}</span> conta
        {perfis?.length === 1 ? '' : 's'} cadastrada{perfis?.length === 1 ? '' : 's'}.
      </p>

      {perfis === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : perfis.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum usuário encontrado" />
      ) : (
        <div className="space-y-2">
          {perfis.map((p) => (
            <Card key={p.userId} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-navy">{p.email}</p>
                <p className="text-xs text-slate-400">
                  {p.favoritos.length} favorito{p.favoritos.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {p.isAdmin && (
                  <span className="flex items-center gap-1 rounded-full bg-brand-gradient px-2.5 py-1 text-xs font-bold text-white">
                    <Shield className="h-3 w-3" strokeWidth={2} />
                    Admin
                  </span>
                )}
                {p.isPremium && !p.isAdmin && (
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                    <Crown className="h-3 w-3" strokeWidth={2} />
                    Premium
                  </span>
                )}
                {!p.isPremium && !p.isAdmin && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Grátis</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
