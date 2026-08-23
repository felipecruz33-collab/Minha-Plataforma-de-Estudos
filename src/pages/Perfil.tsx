import { Check, Crown, Shield } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../lib/auth/AuthContext'
import { usingSupabase } from '../lib/repo'

export default function Perfil() {
  const { perfil, atualizarNome } = useAuth()
  const [nome, setNome] = useState(perfil?.nome ?? '')
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)

  if (!perfil) return null

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    setSalvo(false)
    try {
      await atualizarNome(nome)
      setSalvo(true)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="max-w-md">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-lg font-bold text-white">
            {(perfil.nome.trim() || perfil.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-navy">{perfil.nome.trim() || 'Sem nome cadastrado'}</p>
            <p className="truncate text-sm text-slate-400">{perfil.email}</p>
          </div>
        </div>

        <div className="mb-4 flex gap-1.5">
          {perfil.isAdmin && (
            <span className="flex items-center gap-1 rounded-full bg-brand-gradient px-2.5 py-1 text-xs font-bold text-white">
              <Shield className="h-3 w-3" strokeWidth={2} />
              Administrador
            </span>
          )}
          {perfil.isPremium && (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
              <Crown className="h-3 w-3" strokeWidth={2} />
              Premium
            </span>
          )}
        </div>

        <form onSubmit={salvar}>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-600">Nome</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value)
                setSalvo(false)
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-blue"
            />
          </label>
          <Button type="submit" disabled={salvando || !nome.trim()}>
            {salvo ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2} />
                Salvo
              </>
            ) : salvando ? (
              'Salvando…'
            ) : (
              'Salvar'
            )}
          </Button>
        </form>
      </Card>

      <Card className="mt-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Diagnóstico técnico</p>
        <dl className="space-y-1 text-xs text-slate-500">
          <div className="flex justify-between gap-2">
            <dt>Backend</dt>
            <dd className="font-mono">{usingSupabase ? 'Supabase' : 'Local (sem Supabase)'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>ID do usuário</dt>
            <dd className="break-all font-mono">{perfil.userId}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>E-mail</dt>
            <dd className="font-mono">{perfil.email}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>isAdmin</dt>
            <dd className="font-mono">{String(perfil.isAdmin)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>isPremium</dt>
            <dd className="font-mono">{String(perfil.isPremium)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  )
}
