import { AlertCircle, AlertTriangle, Crown, Lock, Shield, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, usingSupabase } from '../lib/repo'
import type { Perfil } from '../lib/types'

export default function Usuarios() {
  const { perfil, user, refreshPerfil } = useAuth()
  const [perfis, setPerfis] = useState<Perfil[] | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Perfil | null>(null)

  async function carregar() {
    setPerfis(await repo.listPerfis())
  }

  useEffect(() => {
    if (!perfil?.isAdmin) return
    carregar()
  }, [perfil?.isAdmin])

  if (!perfil?.isAdmin) {
    return <EmptyState icon={Lock} title="Esta tela é exclusiva do administrador" />
  }

  async function alternarPremium(alvo: Perfil) {
    setOcupado(alvo.userId)
    setErro(null)
    try {
      await repo.setPremium(alvo.userId, !alvo.isPremium)
      await carregar()
      // Se o admin mexeu no próprio Premium, o cabeçalho e os bloqueios da
      // sessão atual precisam acompanhar sem exigir um recarregamento.
      if (alvo.userId === user?.id) await refreshPerfil()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível alterar o Premium.')
    } finally {
      setOcupado(null)
    }
  }

  async function confirmarExclusao() {
    if (!paraExcluir) return
    const alvo = paraExcluir
    setParaExcluir(null)
    setOcupado(alvo.userId)
    setErro(null)
    try {
      await repo.excluirUsuario(alvo.userId)
      await carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível excluir a conta.')
    } finally {
      setOcupado(null)
    }
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

      <p className="mb-1 text-sm text-slate-500">
        <span className="font-semibold text-navy">{perfis?.length ?? 0}</span> conta
        {perfis?.length === 1 ? '' : 's'} cadastrada{perfis?.length === 1 ? '' : 's'}.
      </p>
      <p className="mb-4 text-sm text-slate-500">
        O Premium libera a Biblioteca compartilhada e os PDFs com IA sem limite. Você pode conceder
        de cortesia a qualquer momento — quando a assinatura da Play Store existir, ela vai mexer
        neste mesmo botão, e o controle manual continua valendo.
      </p>

      {erro && (
        <p className="mb-3 flex items-start gap-1.5 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>{erro}</span>
        </p>
      )}

      {perfis === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : perfis.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum usuário encontrado" />
      ) : (
        <div className="space-y-2">
          {perfis.map((p) => {
            const souEu = p.userId === user?.id
            return (
              <Card key={p.userId}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy">
                      {p.email}
                      {souEu && <span className="ml-1.5 text-xs font-normal text-slate-400">(você)</span>}
                    </p>
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
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  {p.isAdmin ? (
                    // Administrador já tem tudo que o Premium dá; um botão aqui
                    // só criaria a dúvida de por que nada muda ao clicar.
                    <p className="text-xs text-slate-400">Administrador já tem acesso completo.</p>
                  ) : (
                    <Button
                      variant={p.isPremium ? 'secondary' : 'primary'}
                      disabled={ocupado === p.userId}
                      onClick={() => alternarPremium(p)}
                    >
                      <Crown className="h-4 w-4" strokeWidth={1.75} />
                      {ocupado === p.userId ? 'Salvando…' : p.isPremium ? 'Remover Premium' : 'Conceder Premium'}
                    </Button>
                  )}

                  {!souEu && (
                    <button
                      type="button"
                      onClick={() => setParaExcluir(p)}
                      disabled={ocupado === p.userId}
                      className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      Excluir conta
                    </button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!paraExcluir}
        title={`Excluir a conta ${paraExcluir?.email}?`}
        description="A conta e TODO o conteúdo dela (matérias, aulas, questões, respostas e histórico) serão apagados permanentemente. Isso não pode ser desfeito."
        onConfirm={confirmarExclusao}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  )
}
