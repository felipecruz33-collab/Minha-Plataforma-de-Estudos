import { Check, Crown, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useAuth } from '../lib/auth/AuthContext'
import { BIBLIOTECA_ABERTA_PARA_TODOS } from '../lib/premium'
import { repo, usingSupabase } from '../lib/repo'

const RECURSOS = [
  { nome: 'Sua biblioteca pessoal (matérias, aulas, questões)', gratis: true, premium: true },
  { nome: 'Importação de PDF com IA e arquivo .json', gratis: true, premium: true },
  { nome: 'Desempenho, simulados, favoritos e revisão', gratis: true, premium: true },
  { nome: 'Sem anúncios', gratis: true, premium: true },
  {
    nome: BIBLIOTECA_ABERTA_PARA_TODOS
      ? 'Biblioteca compartilhada (catálogo curado) · liberada temporariamente'
      : 'Biblioteca compartilhada (catálogo curado)',
    gratis: BIBLIOTECA_ABERTA_PARA_TODOS,
    premium: true,
  },
]

const PRODUCT_ID = (import.meta.env.VITE_PREMIUM_PRODUCT_ID as string | undefined) ?? 'premium_mensal'

export default function Premium() {
  const { user, perfil, refreshPerfil } = useAuth()
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  if (perfil?.isPremium || perfil?.isAdmin) {
    return (
      <Card className="flex flex-col items-center gap-3 py-14 text-center">
        <Crown className="h-10 w-10 text-amber-400" strokeWidth={1.5} />
        <p className="font-semibold text-navy">
          {perfil.isAdmin ? 'Você tem acesso total como administrador.' : 'Você já é Premium!'}
        </p>
        <p className="max-w-sm text-sm text-slate-400">A Biblioteca compartilhada está liberada para você.</p>
        <Link to="/biblioteca">
          <Button>Ir para a biblioteca</Button>
        </Link>
      </Card>
    )
  }

  async function assinar() {
    if (!user) return
    setErro(null)
    setCarregando(true)
    try {
      await repo.setPremium(user.id, true)
      await refreshPerfil()
    } catch (e) {
      setErro(
        usingSupabase
          ? 'A ativação do Premium acontece pelo backend após a confirmação do Google Play Billing (webhook), não diretamente pelo app.'
          : e instanceof Error
            ? e.message
            : 'Não foi possível ativar o Premium.',
      )
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6 text-center">
        <Crown className="mx-auto mb-2 h-10 w-10 text-amber-400" strokeWidth={1.5} />
        <h1 className="text-xl font-bold text-navy">Assine o Premium</h1>
        <p className="text-sm text-slate-500">Assinatura mensal via Google Play · sem anúncios em nenhuma tela</p>
      </div>

      <Card className="mb-4 overflow-hidden !p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white">
              <th className="px-3 py-2 text-left font-semibold">Recurso</th>
              <th className="px-3 py-2 text-center font-semibold">Grátis</th>
              <th className="px-3 py-2 text-center font-semibold">Premium</th>
            </tr>
          </thead>
          <tbody>
            {RECURSOS.map((r) => (
              <tr key={r.nome} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2.5 text-slate-700">{r.nome}</td>
                <td className="px-3 py-2.5 text-center">
                  {r.gratis ? (
                    <Check className="mx-auto h-4 w-4 text-emerald-500" strokeWidth={2} />
                  ) : (
                    <X className="mx-auto h-4 w-4 text-slate-300" strokeWidth={2} />
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {r.premium ? <Check className="mx-auto h-4 w-4 text-emerald-500" strokeWidth={2} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {BIBLIOTECA_ABERTA_PARA_TODOS && (
        <p className="mb-4 text-xs text-slate-400">
          A Biblioteca compartilhada está temporariamente liberada para todos, mesmo sem Premium.
        </p>
      )}

      {erro && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{erro}</p>}

      <Button onClick={assinar} disabled={carregando} className="w-full">
        {carregando ? 'Processando…' : 'Assinar Premium mensal'}
      </Button>
      <p className="mt-2 text-center text-xs text-slate-400">Produto: {PRODUCT_ID} · cobrado pela Google Play</p>
    </div>
  )
}
