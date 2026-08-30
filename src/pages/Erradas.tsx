import { XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { CarregarMais } from '../components/ui/CarregarMais'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { useFiltroMateriaAula } from '../lib/hooks/useFiltroMateriaAula'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import type { Resposta } from '../lib/types'

const selectCls = 'rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-blue'

export default function Erradas() {
  const { user } = useAuth()
  const { questaoPorId, materias, aulas, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)

  useEffect(() => {
    if (!user) return
    repo.listRespostas(user.id).then(setRespostas)
  }, [user])

  const filtro = useFiltroMateriaAula(materias, aulas)

  // Calculado antes de qualquer saída antecipada: um hook não pode ficar
  // depois de um `return`, e o `useMemo` é o que dá à lista uma identidade
  // estável — sem ela o "carregar mais" nunca sairia da primeira página.
  const todasErradas = useMemo(() => {
    if (!respostas) return []
    const ultimaPorQuestao = new Map<string, Resposta>()
    for (const r of respostas) {
      const atual = ultimaPorQuestao.get(r.questaoId)
      if (!atual || r.respondidoEm > atual.respondidoEm) ultimaPorQuestao.set(r.questaoId, r)
    }
    return Array.from(ultimaPorQuestao.values())
      .filter((r) => !r.correta)
      .map((r) => questaoPorId.get(r.questaoId))
      .filter((q): q is NonNullable<typeof q> => !!q)
  }, [respostas, questaoPorId])

  const erradas = useMemo(() => todasErradas.filter((q) => filtro.combina(q)), [todasErradas, filtro.materiaId, filtro.aulaId])

  const { visiveis, total, temMais, verMais } = useListaVisivel(erradas)

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  if (todasErradas.length === 0) {
    return (
      <EmptyState
        icon={XCircle}
        title="Nenhuma questão errada por aqui"
        description="Continue assim! Questões que você errar por último aparecem nesta lista para revisão."
      />
    )
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        <span className="font-semibold text-navy">{todasErradas.length}</span> questões erradas
        {erradas.length !== todasErradas.length && (
          <>
            {' · '}
            <span className="font-semibold text-navy">{erradas.length}</span> nesta seleção
          </>
        )}
        .
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={filtro.materiaId} onChange={(e) => filtro.setMateriaId(e.target.value)} className={selectCls}>
          <option value="">Todas as matérias</option>
          {filtro.opcoesMateria.map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
        </select>

        <select
          value={filtro.aulaId}
          onChange={(e) => filtro.setAulaId(e.target.value)}
          disabled={!filtro.materiaId}
          className={`${selectCls} disabled:bg-slate-50 disabled:text-slate-400`}
        >
          <option value="">{filtro.materiaId ? 'Todas as aulas' : 'Escolha a matéria'}</option>
          {filtro.opcoesAula.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titulo}
            </option>
          ))}
        </select>
      </div>

      {erradas.length === 0 ? (
        <EmptyState
          icon={XCircle}
          title="Nenhuma questão errada nesta seleção"
          description="Você não errou nada nesta matéria ou aula — ou ainda não respondeu questões dela."
        />
      ) : (
        <div className="space-y-3">
          {visiveis.map((q) => (
            <QuestionCard key={q.id} questao={q} />
          ))}
          <CarregarMais mostrando={visiveis.length} total={total} temMais={temMais} onVerMais={verMais} />
        </div>
      )}
    </div>
  )
}
