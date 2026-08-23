import { ArrowLeft, Check, Copy, FileQuestion, Inbox, Lock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ContentBlock } from '../components/ui/ContentBlock'
import { EmptyState } from '../components/ui/EmptyState'
import { Tabs } from '../components/ui/Tabs'
import { QuestionCard } from '../components/QuestionCard'
import { Button } from '../components/ui/Button'
import { TIPO_BLOCO_LABEL } from '../lib/blocoLabels'
import { useAuth } from '../lib/auth/AuthContext'
import { copiarAulaParaMinhaBiblioteca } from '../lib/copiarAula'
import { repo } from '../lib/repo'
import { TIPOS_COM_ABA, type Aula, type Materia } from '../lib/types'

export default function AulaDetail() {
  const { aulaId } = useParams<{ aulaId: string }>()
  const { user, perfil } = useAuth()
  const podeVerBiblioteca = !!perfil?.isPremium || !!perfil?.isAdmin
  const [aula, setAula] = useState<Aula | null | undefined>(undefined)
  const [materia, setMateria] = useState<Materia | null>(null)
  const [aba, setAba] = useState('teoria')
  const [copiando, setCopiando] = useState(false)
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
    const abas = [{ key: 'teoria', label: 'Teoria' }, ...presentes.map((t) => ({ key: t, label: TIPO_BLOCO_LABEL[t] }))]
    if (aula.questoes.length) abas.push({ key: 'questoes', label: `Questões (${aula.questoes.length})` })
    return abas
  }, [aula])

  if (aula === undefined || (aula && !materia)) return <p className="text-sm text-slate-400">Carregando…</p>
  if (aula === null) return <EmptyState icon={FileQuestion} title="Aula não encontrada" />

  const isBiblioteca = !!materia?.isBiblioteca

  if (isBiblioteca && !podeVerBiblioteca) {
    return (
      <EmptyState icon={Lock} title="Biblioteca compartilhada é exclusiva para assinantes Premium">
        <Link to="/premium">
          <Button>Conhecer o Premium</Button>
        </Link>
      </EmptyState>
    )
  }

  async function copiar() {
    if (!user || !materia || !aula) return
    setCopiando(true)
    try {
      await copiarAulaParaMinhaBiblioteca(user.id, aula, materia.nome)
      setCopiada(true)
    } finally {
      setCopiando(false)
    }
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
          <Button variant="secondary" onClick={copiar} disabled={copiando || copiada} className="shrink-0">
            {copiada ? <Check className="h-4 w-4 text-emerald-500" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.75} />}
            {copiada ? 'Copiada' : 'Copiar para mim'}
          </Button>
        )}
      </div>

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
