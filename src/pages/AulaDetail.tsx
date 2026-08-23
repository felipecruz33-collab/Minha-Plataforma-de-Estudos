import { ArrowLeft, FileQuestion, Inbox } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContentBlock } from '../components/ui/ContentBlock'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabs } from '../components/ui/Tabs'
import { QuestionCard } from '../components/QuestionCard'
import { TIPO_BLOCO_LABEL } from '../lib/blocoLabels'
import { repo } from '../lib/repo'
import { TIPOS_COM_ABA, type Aula } from '../lib/types'

export default function AulaDetail() {
  const { aulaId } = useParams<{ aulaId: string }>()
  const [aula, setAula] = useState<Aula | null | undefined>(undefined)
  const [aba, setAba] = useState('teoria')

  useEffect(() => {
    if (!aulaId) return
    repo.getAula(aulaId).then(setAula)
  }, [aulaId])

  const abasDisponiveis = useMemo(() => {
    if (!aula) return []
    const presentes = TIPOS_COM_ABA.filter((tipo) => aula.blocos.some((b) => b.tipo === tipo))
    const abas = [{ key: 'teoria', label: 'Teoria' }, ...presentes.map((t) => ({ key: t, label: TIPO_BLOCO_LABEL[t] }))]
    if (aula.questoes.length) abas.push({ key: 'questoes', label: `Questões (${aula.questoes.length})` })
    return abas
  }, [aula])

  if (aula === undefined) return <p className="text-sm text-slate-400">Carregando…</p>
  if (aula === null) return <EmptyState icon={FileQuestion} title="Aula não encontrada" />

  const blocosVisiveis =
    aba === 'teoria' ? aula.blocos : aba === 'questoes' ? [] : aula.blocos.filter((b) => b.tipo === aba)

  return (
    <div>
      <Link to=".." relative="path" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Voltar
      </Link>

      <h1 className="mb-4 text-xl font-bold text-navy">{aula.titulo}</h1>

      {abasDisponiveis.length > 1 && (
        <div className="mb-4 -mt-2">
          <Tabs tabs={abasDisponiveis} active={aba} onChange={setAba} />
        </div>
      )}

      {aba === 'questoes' ? (
        <div className="space-y-3 pt-2">
          {aula.questoes.map((q) => (
            <QuestionCard key={q.id} questao={q} />
          ))}
        </div>
      ) : blocosVisiveis.length === 0 ? (
        <EmptyState icon={Inbox} title="Sem conteúdo nesta aba" />
      ) : (
        <div>
          {blocosVisiveis.map((bloco, i) => (
            <ContentBlock key={i} bloco={bloco} />
          ))}
        </div>
      )}
    </div>
  )
}
