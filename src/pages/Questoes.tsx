import { BookOpenCheck, Eraser, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { podeVerBiblioteca as calcPodeVerBiblioteca } from '../lib/premium'
import { repo, type MateriaComContagem } from '../lib/repo'
import type { Questao, Resposta } from '../lib/types'

type Origem = 'pessoal' | 'biblioteca'

interface QuestaoComOrigem extends Questao {
  materiaNome: string
  origem: Origem
}

interface OpcaoMateria {
  id: string
  /** Já vem desambiguado quando duas matérias têm o mesmo nome. */
  rotulo: string
  nome: string
  origem: Origem
}

interface OpcaoAula {
  id: string
  titulo: string
  materiaId: string
}

interface Dados {
  materias: OpcaoMateria[]
  /** Na ordem em que a matéria mostra as aulas — a mesma da tela da matéria. */
  aulas: OpcaoAula[]
  questoes: QuestaoComOrigem[]
}

type Situacao = '' | 'feitas' | 'nao-feitas'

function useSelect() {
  const [value, setValue] = useState('')
  return [value, setValue] as const
}

/**
 * Rótulo do select de matérias.
 *
 * Uma matéria sua e uma da biblioteca podem se chamar igual — e antes o filtro
 * comparava por NOME, então as duas viravam a mesma opção e as questões se
 * misturavam. Agora o filtro é por id; o rótulo só precisa deixar visível qual
 * é qual quando o nome se repete.
 */
function rotularMaterias(materias: Omit<OpcaoMateria, 'rotulo'>[]): OpcaoMateria[] {
  const vezes = new Map<string, number>()
  for (const m of materias) vezes.set(m.nome, (vezes.get(m.nome) ?? 0) + 1)
  return materias.map((m) => ({
    ...m,
    rotulo: (vezes.get(m.nome) ?? 0) > 1 ? `${m.nome} (${m.origem === 'biblioteca' ? 'Biblioteca' : 'Minha'})` : m.nome,
  }))
}

/** A última tentativa de cada questão — é ela que define "feita" e o que o cartão mostra. */
function ultimaRespostaPorQuestao(respostas: Resposta[]): Map<string, Resposta> {
  const mapa = new Map<string, Resposta>()
  for (const r of respostas) {
    const atual = mapa.get(r.questaoId)
    if (!atual || r.respondidoEm > atual.respondidoEm) mapa.set(r.questaoId, r)
  }
  return mapa
}

export default function Questoes() {
  const { user, perfil } = useAuth()
  const [dados, setDados] = useState<Dados | null>(null)
  const [respostas, setRespostas] = useState<Resposta[]>([])
  const [busca, setBusca] = useState('')
  const [materiaId, setMateriaId] = useSelect()
  const [aulaId, setAulaId] = useSelect()
  const [situacao, setSituacao] = useState<Situacao>('')
  const [banca, setBanca] = useSelect()
  const [ano, setAno] = useSelect()
  const [assunto, setAssunto] = useSelect()
  const [confirmandoEsquecer, setConfirmandoEsquecer] = useState(false)
  const [esquecendo, setEsquecendo] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelado = false
    const podeVerBiblioteca = calcPodeVerBiblioteca(perfil)

    Promise.all([
      repo.listMaterias(user.id),
      podeVerBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([]),
      repo.listRespostas(user.id),
    ]).then(async ([minhas, biblio, resps]) => {
      const materias = rotularMaterias([
        ...minhas.map((m) => ({ id: m.id, nome: m.nome, origem: 'pessoal' as const })),
        ...biblio.map((m) => ({ id: m.id, nome: m.nome, origem: 'biblioteca' as const })),
      ])
      // `listAulas` já devolve na ordem que a pessoa organizou na matéria;
      // manter a chamada por matéria (em vez de uma lista geral) preserva essa
      // ordem dentro de cada grupo, que é o que o select de aula precisa.
      const porMateria = await Promise.all(materias.map((m) => repo.listAulas(m.id)))
      if (cancelado) return

      const aulas: OpcaoAula[] = []
      const questoes: QuestaoComOrigem[] = []
      materias.forEach((m, i) => {
        for (const aula of porMateria[i]) {
          aulas.push({ id: aula.id, titulo: aula.titulo, materiaId: m.id })
          for (const q of aula.questoes) questoes.push({ ...q, materiaNome: m.nome, origem: m.origem })
        }
      })

      setDados({ materias, aulas, questoes })
      setRespostas(resps)
    })

    return () => {
      cancelado = true
    }
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  const questoes = dados?.questoes ?? []
  const respostaPorQuestao = useMemo(() => ultimaRespostaPorQuestao(respostas), [respostas])

  const aulasDaMateria = useMemo(
    () => (materiaId ? (dados?.aulas ?? []).filter((a) => a.materiaId === materiaId) : []),
    [dados, materiaId],
  )

  const opcoes = useMemo(
    () => ({
      bancas: Array.from(new Set(questoes.map((q) => q.banca).filter(Boolean))).sort(),
      anos: Array.from(new Set(questoes.map((q) => q.ano).filter(Boolean))).sort().reverse(),
      assuntos: Array.from(new Set(questoes.map((q) => q.tema).filter(Boolean))).sort(),
    }),
    [questoes],
  )

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return questoes.filter((q) => {
      if (materiaId && q.materiaId !== materiaId) return false
      if (aulaId && q.aulaId !== aulaId) return false
      if (situacao) {
        const feita = respostaPorQuestao.has(q.id)
        if (situacao === 'feitas' && !feita) return false
        if (situacao === 'nao-feitas' && feita) return false
      }
      if (banca && q.banca !== banca) return false
      if (ano && q.ano !== ano) return false
      if (assunto && q.tema !== assunto) return false
      if (termo && !q.enunciado.toLowerCase().includes(termo)) return false
      return true
    })
  }, [questoes, respostaPorQuestao, busca, materiaId, aulaId, situacao, banca, ano, assunto])

  const temFiltro = Boolean(busca.trim() || materiaId || aulaId || situacao || banca || ano || assunto)

  /**
   * O "esquecer" segue só matéria/aula, e não os outros filtros.
   *
   * Apagar exatamente a lista visível pareceria mais preciso, mas seria fácil
   * de errar: bastaria uma busca digitada e esquecida na caixa pra ação virar
   * outra coisa sem a pessoa perceber. Matéria e aula estão sempre à vista nos
   * selects, e é esse escopo que o botão e o aviso dizem em voz alta.
   */
  const escopo = aulaId ? { aulaId } : materiaId ? { materiaId } : {}
  const marcadasNoEscopo = useMemo(
    () =>
      questoes.filter(
        (q) =>
          (!materiaId || q.materiaId === materiaId) &&
          (!aulaId || q.aulaId === aulaId) &&
          respostaPorQuestao.has(q.id),
      ).length,
    [questoes, respostaPorQuestao, materiaId, aulaId],
  )

  const nomeEscopo = aulaId
    ? aulasDaMateria.find((a) => a.id === aulaId)?.titulo
    : materiaId
      ? dados?.materias.find((m) => m.id === materiaId)?.rotulo
      : null

  async function esquecer() {
    setConfirmandoEsquecer(false)
    if (!user) return
    setEsquecendo(true)
    try {
      await repo.esquecerRespostas(user.id, escopo)
      setRespostas(await repo.listRespostas(user.id))
    } finally {
      setEsquecendo(false)
    }
  }

  const selectCls = 'rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-blue'

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-semibold text-navy">{questoes.length}</span> questões no seu banco
        {temFiltro && (
          <>
            {' · '}
            <span className="font-semibold text-navy">{filtradas.length}</span> nesta seleção
          </>
        )}
        .
      </p>

      <label className="mb-3 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 focus-within:border-brand-blue">
        <Search className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por enunciado…"
          className="w-full text-sm outline-none"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <select
          value={materiaId}
          onChange={(e) => {
            setMateriaId(e.target.value)
            // Sem isto sobraria uma aula de OUTRA matéria selecionada: a lista
            // zeraria e nada na tela explicaria por quê.
            setAulaId('')
          }}
          className={selectCls}
        >
          <option value="">Todas as matérias</option>
          {(dados?.materias ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
        </select>

        <select
          value={aulaId}
          onChange={(e) => setAulaId(e.target.value)}
          disabled={!materiaId}
          className={`${selectCls} disabled:bg-slate-50 disabled:text-slate-400`}
        >
          <option value="">{materiaId ? 'Todas as aulas' : 'Escolha a matéria'}</option>
          {aulasDaMateria.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titulo}
            </option>
          ))}
        </select>

        <select value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)} className={selectCls}>
          <option value="">Feitas e não feitas</option>
          <option value="nao-feitas">Só as não feitas</option>
          <option value="feitas">Só as já feitas</option>
        </select>

        <select value={banca} onChange={(e) => setBanca(e.target.value)} className={selectCls}>
          <option value="">Todas as bancas</option>
          {opcoes.bancas.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select value={ano} onChange={(e) => setAno(e.target.value)} className={selectCls}>
          <option value="">Todos os anos</option>
          {opcoes.anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={assunto} onChange={(e) => setAssunto(e.target.value)} className={selectCls}>
          <option value="">Todos os assuntos</option>
          {opcoes.assuntos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Discreto de propósito: é uma ação de apagar, e quem não está
          procurando por ela não deve tropeçar nela. Some quando não há nada
          marcado no escopo, pra não oferecer uma ação que não faria nada. */}
      <div className="mb-5 mt-2 min-h-[1.25rem]">
        {marcadasNoEscopo > 0 && (
          <button
            type="button"
            onClick={() => setConfirmandoEsquecer(true)}
            disabled={esquecendo}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy disabled:opacity-50"
          >
            <Eraser className="h-4 w-4" strokeWidth={1.75} />
            {esquecendo
              ? 'Esquecendo…'
              : `${marcadasNoEscopo === 1 ? 'Esquecer a resposta' : `Esquecer as ${marcadasNoEscopo} respostas`}${
                  nomeEscopo ? ` de "${nomeEscopo}"` : ' marcadas'
                }`}
          </button>
        )}
      </div>

      {dados === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="Nenhuma questão encontrada"
          description={situacao === 'nao-feitas' ? 'Você já respondeu todas as questões desta seleção.' : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtradas.map((q) => (
            <div key={q.id} className="relative">
              <span
                className={`absolute right-4 top-4 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  q.origem === 'biblioteca' ? 'bg-brand-gradient text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {q.origem === 'biblioteca' ? 'Biblioteca' : 'Minha'}
              </span>
              <QuestionCard questao={q} respostaAnterior={respostaPorQuestao.get(q.id) ?? null} />
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmandoEsquecer}
        title={nomeEscopo ? `Esquecer as respostas de "${nomeEscopo}"?` : 'Esquecer todas as respostas marcadas?'}
        description={`${marcadasNoEscopo} ${marcadasNoEscopo === 1 ? 'questão volta' : 'questões voltam'} a ficar em branco para você refazer. As tentativas apagadas também saem do Desempenho, da Revisão e da lista de Erradas. As aulas e as questões em si não são afetadas.`}
        confirmLabel="Esquecer respostas"
        onConfirm={esquecer}
        onCancel={() => setConfirmandoEsquecer(false)}
      />
    </div>
  )
}
