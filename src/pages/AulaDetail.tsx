import { ArrowLeft, Check, Copy, FileQuestion, Inbox, Lock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContentBlock } from '../components/ui/ContentBlock'
import { CopyToPersonalDialog } from '../components/CopyToPersonalDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabs } from '../components/ui/Tabs'
import { QuestionCard } from '../components/QuestionCard'
import { Button } from '../components/ui/Button'
import { TIPO_BLOCO_LABEL } from '../lib/blocoLabels'
import { TIPO_BLOCO_ICON, TIPO_BLOCO_ICON_COR } from '../lib/blocoStyle'
import { useAuth } from '../lib/auth/AuthContext'
import { podeVerBiblioteca as calcPodeVerBiblioteca, temPremium } from '../lib/premium'
import { repo } from '../lib/repo'
import { TIPOS_COM_ABA, type Aula, type Materia } from '../lib/types'

export default function AulaDetail() {
  const { aulaId } = useParams<{ aulaId: string }>()
  const { perfil } = useAuth()
  const podeVerBiblioteca = calcPodeVerBiblioteca(perfil)
  const [aula, setAula] = useState<Aula | null | undefined>(undefined)
  const [materia, setMateria] = useState<Materia | null>(null)
  const [aba, setAba] = useState('teoria')
  const [mostrarCopiar, setMostrarCopiar] = useState(false)
  const [copiada, setCopiada] = useState(false)

  useEffect(() => {
    if (!aulaId) return
    repo.getAula(aulaId).then(async (a) => {
      setAula(a)
      if (a) setMateria(await repo.getMateria(a.materiaId))
    })
  }, [aulaId])

  const abasDisponiveis = useMemo(() => {
    if (!aula) return []
    const presentes = TIPOS_COM_ABA.filter((tipo) => aula.blocos.some((b) => b.tipo === tipo))
    const abas = [
      { key: 'teoria', label: 'Teoria', icon: TIPO_BLOCO_ICON.texto, iconColorClass: TIPO_BLOCO_ICON_COR.texto },
      ...presentes.map((t) => ({ key: t, label: TIPO_BLOCO_LABEL[t], icon: TIPO_BLOCO_ICON[t], iconColorClass: TIPO_BLOCO_ICON_COR[t] })),
    ]
    if (aula.questoes.length) {
      abas.push({ key: 'questoes', label: `Questões (${aula.questoes.length})`, icon: FileQuestion, iconColorClass: 'text-navy' })
    }
    return abas
  }, [aula])

  if (aula === undefined || (aula && !materia)) return <p className="text-sm text-slate-400">Carregando…</p>
  if (aula === null) return <EmptyState icon={FileQuestion} title="Aula não encontrada" />

  const isBiblioteca = !!materia?.isBiblioteca

  /**
   * Cópia da biblioteca numa conta que não tem mais Premium.
   *
   * A aula continua aparecendo, com o título — o que não vem é o conteúdo, e
   * quem decide isso é a RLS do banco. Aqui a tela só EXPLICA: sem esta
   * mensagem a pessoa abriria uma aula vazia e concluiria que perdeu o que
   * tinha, que é indistinguível de um bug e o caminho mais curto pra uma
   * avaliação de uma estrela.
   */
  if (aula.daBiblioteca && !temPremium(perfil)) {
    return (
      <div>
        <Link to=".." relative="path" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Voltar
        </Link>
        <EmptyState icon={Lock} title={aula.titulo}>
          <p className="mx-auto mb-4 max-w-sm text-sm text-slate-500">
            Esta aula veio da <strong>Biblioteca compartilhada</strong>, que faz parte do Premium. O conteúdo dela
            fica guardado e volta inteiro — com as suas respostas — assim que a assinatura for reativada.
          </p>
          <Link to="/premium">
            <Button>Reativar o Premium</Button>
          </Link>
        </EmptyState>
      </div>
    )
  }

  if (isBiblioteca && !podeVerBiblioteca) {
    return (
      <EmptyState icon={Lock} title="Biblioteca compartilhada é exclusiva para assinantes Premium">
        <Link to="/premium">
          <Button>Conhecer o Premium</Button>
        </Link>
      </EmptyState>
    )
  }

  const blocosVisiveis =
    aba === 'teoria' ? aula.blocos : aba === 'questoes' ? [] : aula.blocos.filter((b) => b.tipo === aba)

  return (
    <div>
      <Link to=".." relative="path" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Voltar
      </Link>

      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-navy">{aula.titulo}</h1>
        {isBiblioteca && (
          <Button variant="secondary" onClick={() => setMostrarCopiar(true)} disabled={copiada} className="shrink-0">
            {copiada ? <Check className="h-4 w-4 text-emerald-500" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
            {copiada ? 'Copiada' : 'Copiar para mim'}
          </Button>
        )}
      </div>

      {abasDisponiveis.length > 1 && (
        <div className="mb-4 -mt-2">
          <Tabs tabs={abasDisponiveis} active={aba} onChange={setAba} variant="pill" />
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

      {mostrarCopiar && (
        <CopyToPersonalDialog
          aula={aula}
          materiaOrigemNome={materia?.nome ?? ''}
          onClose={() => setMostrarCopiar(false)}
          onCopied={() => setCopiada(true)}
        />
      )}
    </div>
  )
}
