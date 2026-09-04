import { ArrowLeft, BookOpenCheck, CheckSquare, Eraser, Eye, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { Button } from '../components/ui/Button'
import { CarregarMais } from '../components/ui/CarregarMais'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { contemTodasAsPalavras } from '../lib/buscarTexto'
import { useCorrecaoAdiada } from '../lib/hooks/useCorrecaoAdiada'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
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

type Situacao = '' | 'feitas' | 'nao-feitas' | 'pendentes'

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
  const correcao = useCorrecaoAdiada(user?.id)
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
  /** Seleção manual de questões para apagar a resposta de cada uma. */
  const [selecionando, setSelecionando] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [esquecendo, setEsquecendo] = useState(false)
  const [aExcluir, setAExcluir] = useState<QuestaoComOrigem | null>(null)

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
      // Uma consulta só para todas as matérias, e sem os blocos de conteúdo —
      // esta tela mostra questões, não o texto da aula. As aulas já voltam
      // ordenadas dentro de cada matéria, que é o que o select de aula precisa.
      const todas = await repo.listAulasComQuestoes(materias.map((m) => m.id))
      if (cancelado) return

      const materiaPorId = new Map(materias.map((m) => [m.id, m]))
      const aulas: OpcaoAula[] = []
      const questoes: QuestaoComOrigem[] = []
      for (const aula of todas) {
        const m = materiaPorId.get(aula.materiaId)
        if (!m) continue
        aulas.push({ id: aula.id, titulo: aula.titulo, materiaId: m.id })
        for (const q of aula.questoes) questoes.push({ ...q, materiaNome: m.nome, origem: m.origem })
      }

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
    const termo = busca.trim()
    return questoes.filter((q) => {
      if (materiaId && q.materiaId !== materiaId) return false
      if (aulaId && q.aulaId !== aulaId) return false
      if (situacao) {
        const feita = respostaPorQuestao.has(q.id)
        if (situacao === 'feitas' && !feita) return false
        if (situacao === 'nao-feitas' && feita) return false
        // Também o que acabou de ser corrigido: mandar corrigir tem que
        // ENTREGAR a correção, e não fechar a lista na cara de quem pediu.
        if (situacao === 'pendentes' && !correcao.pendentes.has(q.id) && !correcao.reveladasAgora.has(q.id))
          return false
      }
      if (banca && q.banca !== banca) return false
      if (ano && q.ano !== ano) return false
      if (assunto && q.tema !== assunto) return false
      // A busca cobre a questão inteira, não só o enunciado: muita coisa que a
      // pessoa lembra está numa alternativa ou na explicação — e era ali que a
      // busca antiga falhava sem dizer por quê.
      if (termo) {
        const textoDaQuestao = [
          q.enunciado,
          q.explicacao,
          q.tema,
          q.orgao,
          ...q.alternativas.map((a) => a.texto),
          ...Object.values(q.altExp),
        ].join(' ')
        if (!contemTodasAsPalavras(textoDaQuestao, termo)) return false
      }
      return true
    })
  }, [questoes, respostaPorQuestao, busca, materiaId, aulaId, situacao, banca, ano, assunto, correcao.pendentes, correcao.reveladasAgora])

  const { visiveis, total, temMais, verMais } = useListaVisivel(filtradas)

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

  /**
   * Volta para a lista inteira sem recarregar a página.
   *
   * Existe porque "só as que faltam corrigir" é uma lista que se esvazia
   * sozinha: quando a última é corrigida não sobra nada para o filtro, e a
   * opção que levou até ali desapareceria do select junto — a única saída
   * seria dar F5.
   */
  function voltarParaTodas() {
    setSituacao('')
    correcao.limparReveladas()
  }

  function alternarSelecao(questaoId: string) {
    setSelecionadas((atual) => {
      const novo = new Set(atual)
      if (novo.has(questaoId)) novo.delete(questaoId)
      else novo.add(questaoId)
      return novo
    })
  }

  /** Só faz sentido selecionar o que TEM resposta gravada pra apagar. */
  const visiveisComResposta = useMemo(
    () => filtradas.filter((q) => respostaPorQuestao.has(q.id)).map((q) => q.id),
    [filtradas, respostaPorQuestao],
  )

  function sairDaSelecao() {
    setSelecionando(false)
    setSelecionadas(new Set())
  }

  async function esquecerSelecionadas() {
    if (!user || selecionadas.size === 0) return
    setEsquecendo(true)
    try {
      await repo.esquecerRespostas(user.id, { questaoIds: [...selecionadas] })
      setRespostas(await repo.listRespostas(user.id))
      sairDaSelecao()
    } finally {
      setEsquecendo(false)
    }
  }

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

  /**
   * Quem pode apagar o quê.
   *
   * A questão é sua se veio de uma matéria sua. Da biblioteca, só o
   * administrador — que é quem cura aquele conteúdo e precisa poder tirar uma
   * questão ruim de lá. Isto é só a tela: quem recusa de verdade é a RLS do
   * banco, que aplica exatamente a mesma regra.
   */
  function podeExcluir(q: QuestaoComOrigem): boolean {
    return q.origem === 'pessoal' || !!perfil?.isAdmin
  }

  async function excluir() {
    const q = aExcluir
    setAExcluir(null)
    if (!q || !dados) return
    // Some da tela na hora; o cache do repositório já foi limpo pela escrita,
    // então a próxima visita traz a lista certa do servidor de qualquer jeito.
    setDados({ ...dados, questoes: dados.questoes.filter((x) => x.id !== q.id) })
    try {
      await repo.excluirQuestao(q.id)
    } catch {
      // Devolve a questão para a lista: sumir da tela sem ter sumido do banco
      // seria pior do que o erro, porque ela voltaria sozinha depois.
      setDados((atual) => (atual ? { ...atual, questoes: [...atual.questoes, q] } : atual))
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
          placeholder="Buscar por qualquer palavra da questão…"
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

        <select
          value={situacao}
          onChange={(e) => {
            const nova = e.target.value as Situacao
            // Saiu da lista de pendentes por conta própria: o rastro do que foi
            // corrigido agora já cumpriu o papel e não precisa envelhecer aqui.
            if (situacao === 'pendentes' && nova !== 'pendentes') correcao.limparReveladas()
            setSituacao(nova)
          }}
          className={selectCls}
        >
          <option value="">Feitas e não feitas</option>
          <option value="nao-feitas">Só as não feitas</option>
          <option value="feitas">Só as já feitas</option>
          {/* Continua na lista enquanto ela estiver aberta, mesmo com a fila já
              zerada: sumir com a opção selecionada deixaria o select mostrando
              um filtro que não existe mais. */}
          {(correcao.pendentes.size > 0 || situacao === 'pendentes') && (
            <option value="pendentes">
              {correcao.pendentes.size > 0 ? 'Só as que faltam corrigir' : 'Só as que acabei de corrigir'}
            </option>
          )}
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

      {/* Correção na hora x correção depois.
          Quem faz uma bateria não quer o gabarito da primeira antes de ler a
          segunda — o gabarito muda a forma de ler o que vem depois. */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={correcao.adiada}
            onChange={(e) => correcao.setAdiada(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-blue"
          />
          <span className="text-xs text-slate-600">
            <span className="font-semibold text-navy">Corrigir só quando eu pedir.</span> A resposta é gravada na hora,
            mas o gabarito e o comentário ficam escondidos até você mandar corrigir — dá pra fazer uma sequência inteira
            sem que uma questão entregue a próxima.
          </span>
        </label>

        {(correcao.pendentes.size > 0 || (situacao === 'pendentes' && correcao.reveladasAgora.size > 0)) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
            {correcao.pendentes.size > 0 ? (
              <p className="text-xs text-slate-600">
                <strong className="text-navy">{correcao.pendentes.size}</strong>{' '}
                {correcao.pendentes.size === 1 ? 'questão respondida esperando' : 'questões respondidas esperando'}{' '}
                correção.
              </p>
            ) : (
              <p className="text-xs text-slate-600">
                <strong className="text-emerald-700">Corrigidas.</strong> As{' '}
                <strong className="text-navy">{correcao.reveladasAgora.size}</strong>{' '}
                {correcao.reveladasAgora.size === 1 ? 'questão continua' : 'questões continuam'} aqui com o gabarito e os
                comentários — leia com calma e volte quando quiser.
              </p>
            )}
            <div className="flex gap-2">
              {situacao === 'pendentes' ? (
                <Button variant="secondary" onClick={voltarParaTodas} className="px-3 py-1.5 text-xs">
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                  Voltar para todas
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setSituacao('pendentes')} className="px-3 py-1.5 text-xs">
                  Ver só elas
                </Button>
              )}
              {correcao.pendentes.size > 0 && (
                <Button onClick={correcao.revelarTodas} className="px-3 py-1.5 text-xs">
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} />
                  Corrigir agora
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Discreto de propósito: é uma ação de apagar, e quem não está
          procurando por ela não deve tropeçar nela. Some quando não há nada
          marcado no escopo, pra não oferecer uma ação que não faria nada. */}
      <div className="mb-5 mt-2 min-h-[1.25rem]">
        {selecionando ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <span className="text-sm text-slate-600">
              <strong className="text-navy">{selecionadas.size}</strong>{' '}
              {selecionadas.size === 1 ? 'selecionada' : 'selecionadas'}
            </span>
            <button
              type="button"
              onClick={() => setSelecionadas(new Set(visiveisComResposta))}
              className="text-xs font-medium text-brand-blue hover:underline"
            >
              marcar todas da lista
            </button>
            {selecionadas.size > 0 && (
              <button type="button" onClick={() => setSelecionadas(new Set())} className="text-xs font-medium text-slate-400 hover:underline">
                limpar
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" onClick={sairDaSelecao} className="px-3 py-1.5 text-xs">
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Cancelar
              </Button>
              <Button
                onClick={esquecerSelecionadas}
                disabled={selecionadas.size === 0 || esquecendo}
                className="px-3 py-1.5 text-xs"
              >
                <Eraser className="h-3.5 w-3.5" strokeWidth={2} />
                {esquecendo ? 'Esquecendo…' : 'Esquecer as selecionadas'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
            {/* A alternativa precisa: apagar UMA a uma, escolhendo. */}
            {visiveisComResposta.length > 0 && (
              <button
                type="button"
                onClick={() => setSelecionando(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy"
              >
                <CheckSquare className="h-4 w-4" strokeWidth={1.75} />
                Escolher quais esquecer
              </button>
            )}
          </div>
        )}
      </div>

      {dados === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title={situacao === 'pendentes' ? 'Nada esperando correção' : 'Nenhuma questão encontrada'}
          description={
            situacao === 'pendentes'
              ? 'Todas as respostas desta seleção já foram corrigidas.'
              : situacao === 'nao-feitas'
                ? 'Você já respondeu todas as questões desta seleção.'
                : undefined
          }
        >
          {/* A saída fica dentro do próprio vazio: é justamente aqui que a
              pessoa fica sem nada para clicar. */}
          {situacao === 'pendentes' && (
            <Button variant="secondary" onClick={voltarParaTodas} className="px-3 py-1.5 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
              Voltar para todas as questões
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {visiveis.map((q) => {
            const temResposta = respostaPorQuestao.has(q.id)
            return (
              <div key={q.id} className="relative">
                {/* No modo de seleção a caixa fica ACIMA do cartão, não dentro:
                    o cartão é o mesmo componente de cinco telas, e enfiar uma
                    seleção que só existe aqui dentro dele espalharia esta tela
                    pelas outras quatro. */}
                {selecionando && (
                  <label
                    className={`mb-1 flex items-center gap-2 text-xs font-medium ${
                      temResposta ? 'cursor-pointer text-slate-600' : 'cursor-not-allowed text-slate-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!temResposta}
                      checked={selecionadas.has(q.id)}
                      onChange={() => alternarSelecao(q.id)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-blue disabled:opacity-40"
                    />
                    {temResposta ? 'Esquecer a resposta desta' : 'Sem resposta gravada'}
                  </label>
                )}
                <span
                  className={`absolute right-4 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    selecionando ? 'top-9' : 'top-4'
                  } ${q.origem === 'biblioteca' ? 'bg-brand-gradient text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  {q.origem === 'biblioteca' ? 'Biblioteca' : 'Minha'}
                </span>
                <QuestionCard
                  questao={q}
                  respostaAnterior={respostaPorQuestao.get(q.id) ?? null}
                  onExcluir={podeExcluir(q) ? () => setAExcluir(q) : undefined}
                  correcaoAdiada={correcao.adiada}
                  revelada={!correcao.pendentes.has(q.id)}
                  onRespondida={() => correcao.adiada && correcao.marcarPendente(q.id)}
                />
              </div>
            )
          })}
          <CarregarMais mostrando={visiveis.length} total={total} temMais={temMais} onVerMais={verMais} />
        </div>
      )}

      <ConfirmDialog
        open={aExcluir !== null}
        title="Excluir esta questão?"
        description={
          aExcluir?.origem === 'biblioteca'
            ? 'Esta questão é da biblioteca compartilhada: excluir tira ela de TODOS os assinantes, não só de você. As respostas dadas a ela também são apagadas.'
            : 'A questão sai do seu banco e da aula onde ela aparece. As respostas que você deu a ela também são apagadas, então o Desempenho muda. Se você reimportar o PDF dessa aula, ela volta.'
        }
        confirmLabel="Excluir questão"
        onConfirm={excluir}
        onCancel={() => setAExcluir(null)}
      />

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
