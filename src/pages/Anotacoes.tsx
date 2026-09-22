import {
  ArrowLeft,
  Check,
  Eye,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { TextoComTabelas } from '../components/ui/TextoComTabelas'
import { useAuth } from '../lib/auth/AuthContext'
import { contemTodasAsPalavras } from '../lib/buscarTexto'
import { agruparPorOrigem, GRUPO_BIBLIOTECA, GRUPO_MINHAS, nomesDuplicados, rotuloDaMateria } from '../lib/materiasPorOrigem'
import { podeVerBiblioteca as calcPodeVerBiblioteca } from '../lib/premium'
import { repo, type AulaBasica, type MateriaComContagem } from '../lib/repo'
import { tempoRelativo } from '../lib/tempoRelativo'
import type { Anotacao } from '../lib/types'

/** Quanto tempo de silêncio no teclado antes de gravar. */
const ESPERA_SALVAR_MS = 800

/** Identidade da anotação que ainda não existe no banco. */
const NOVA = 'nova'

type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'erro'

interface Rascunho {
  materiaId: string | null
  aulaId: string | null
  titulo: string
  corpo: string
}

const VAZIO: Rascunho = { materiaId: null, aulaId: null, titulo: '', corpo: '' }

const selectCls =
  'min-w-0 max-w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-blue'

export default function Anotacoes() {
  const { user, perfil } = useAuth()
  const [anotacoes, setAnotacoes] = useState<Anotacao[] | null>(null)
  const [materias, setMaterias] = useState<MateriaComContagem[]>([])
  const [aulas, setAulas] = useState<AulaBasica[]>([])
  const [busca, setBusca] = useState('')
  const [filtroMateria, setFiltroMateria] = useState('')
  const [filtroAula, setFiltroAula] = useState('')

  /** Qual anotação está aberta no editor: um id, `NOVA`, ou nenhuma. */
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho>(VAZIO)
  const [estado, setEstado] = useState<EstadoSalvamento>('ocioso')
  const [visualizando, setVisualizando] = useState(false)
  const [aExcluir, setAExcluir] = useState<Anotacao | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelado = false
    // A biblioteca entra junto das matérias próprias — é material de estudo
    // igual, e anotar sobre ele é o uso mais natural que existe. Quem não tem
    // Premium simplesmente não recebe essa parte da lista.
    const podeBiblioteca = calcPodeVerBiblioteca(perfil)
    Promise.all([
      repo.listAnotacoes(user.id),
      repo.listMaterias(user.id),
      podeBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([]),
    ]).then(async ([as, minhas, biblio]) => {
      if (cancelado) return
      const todas = [...minhas, ...biblio]
      setAnotacoes(as)
      setMaterias(todas)
      // Uma consulta só para as aulas de todas as matérias, sem blocos nem
      // questões: aqui só interessa o título para montar o segundo select.
      const listaAulas = await repo.listAulasBasicas(todas.map((m) => m.id))
      if (!cancelado) setAulas(listaAulas)
    })
    return () => {
      cancelado = true
    }
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  /** Nomes repetidos entre as duas origens — só eles precisam de carimbo. */
  const duplicados = useMemo(() => nomesDuplicados(materias), [materias])
  const grupos = useMemo(() => agruparPorOrigem(materias), [materias])

  const aulasDaMateria = useCallback(
    (materiaId: string | null) => (materiaId ? aulas.filter((a) => a.materiaId === materiaId) : []),
    [aulas],
  )

  const nomeDaMateria = useCallback(
    (materiaId: string | null) => {
      const m = materiaId ? materias.find((x) => x.id === materiaId) : null
      return m ? rotuloDaMateria(m, duplicados) : null
    },
    [materias, duplicados],
  )
  const tituloDaAula = useCallback(
    (aulaId: string | null) => (aulaId ? aulas.find((a) => a.id === aulaId)?.titulo ?? null : null),
    [aulas],
  )

  const lista = useMemo(() => {
    const termo = busca.trim()
    return (anotacoes ?? []).filter((a) => {
      if (filtroMateria === 'sem' ? a.materiaId !== null : filtroMateria && a.materiaId !== filtroMateria) return false
      if (filtroAula && a.aulaId !== filtroAula) return false
      // A busca cobre título E corpo: quem procura uma anotação lembra de uma
      // frase que escreveu no meio dela, quase nunca do título que deu.
      if (termo && !contemTodasAsPalavras(`${a.titulo} ${a.corpo}`, termo)) return false
      return true
    })
  }, [anotacoes, busca, filtroMateria, filtroAula])

  // ---------------------------------------------------------------- salvar --
  //
  // O salvamento é automático, com um respiro depois da última tecla. Botão de
  // salvar em bloco de notas é uma armadilha: a pessoa escreve, troca de tela
  // e descobre depois que perdeu — e anotação é justamente o que não dá para
  // reconstituir. O que o botão dava (saber que gravou) vira o rótulo ao lado
  // do título.
  const salvarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // `criando` evita a corrida que duplicaria a anotação: duas gravações
  // disparadas antes de a primeira voltar com o id criariam duas linhas.
  const criando = useRef(false)
  const ultimoSalvo = useRef<Rascunho>(VAZIO)

  const gravar = useCallback(
    async (id: string, valores: Rascunho) => {
      if (!user) return
      const vazia = !valores.titulo.trim() && !valores.corpo.trim()
      setEstado('salvando')
      try {
        if (id === NOVA) {
          // Anotação em branco não vira linha no banco. Quem abre "nova" e
          // desiste não deixa lixo para trás.
          if (vazia || criando.current) return
          criando.current = true
          const nova = await repo.criarAnotacao({
            userId: user.id,
            materiaId: valores.materiaId,
            aulaId: valores.aulaId,
            titulo: valores.titulo,
            corpo: valores.corpo,
          })
          criando.current = false
          setAnotacoes((atual) => [nova, ...(atual ?? [])])
          setAbertaId(nova.id)
        } else {
          const salva = await repo.salvarAnotacao(id, valores)
          setAnotacoes((atual) => (atual ?? []).map((a) => (a.id === id ? salva : a)))
        }
        ultimoSalvo.current = valores
        setEstado('salvo')
      } catch {
        criando.current = false
        setEstado('erro')
      }
    },
    [user],
  )

  useEffect(() => {
    if (abertaId === null) return
    const igual =
      rascunho.titulo === ultimoSalvo.current.titulo &&
      rascunho.corpo === ultimoSalvo.current.corpo &&
      rascunho.materiaId === ultimoSalvo.current.materiaId &&
      rascunho.aulaId === ultimoSalvo.current.aulaId
    if (igual) return

    // "Salvando…" já na tecla, e não só quando a gravação parte. Durante a
    // espera o texto digitado ainda não está em lugar nenhum; ficar sem aviso
    // nenhum nesse intervalo é o que faz a pessoa desconfiar e procurar um
    // botão de salvar que não existe. A distinção entre "esperando o silêncio"
    // e "gravando" é detalhe de implementação — para quem escreve, os dois
    // momentos são o mesmo: o aplicativo está cuidando disso.
    setEstado('salvando')
    if (salvarTimer.current) clearTimeout(salvarTimer.current)
    salvarTimer.current = setTimeout(() => gravar(abertaId, rascunho), ESPERA_SALVAR_MS)
    return () => {
      if (salvarTimer.current) clearTimeout(salvarTimer.current)
    }
  }, [abertaId, rascunho, gravar])

  /** Sair do editor não pode perder o que ainda estava no ar. */
  function fechar() {
    if (salvarTimer.current) clearTimeout(salvarTimer.current)
    if (abertaId !== null) {
      const igual =
        rascunho.titulo === ultimoSalvo.current.titulo &&
        rascunho.corpo === ultimoSalvo.current.corpo &&
        rascunho.materiaId === ultimoSalvo.current.materiaId &&
        rascunho.aulaId === ultimoSalvo.current.aulaId
      if (!igual) gravar(abertaId, rascunho)
    }
    setAbertaId(null)
    setRascunho(VAZIO)
    setEstado('ocioso')
    setVisualizando(false)
  }

  function abrir(a: Anotacao) {
    if (salvarTimer.current) clearTimeout(salvarTimer.current)
    const valores = { materiaId: a.materiaId, aulaId: a.aulaId, titulo: a.titulo, corpo: a.corpo }
    ultimoSalvo.current = valores
    setRascunho(valores)
    setAbertaId(a.id)
    setEstado('ocioso')
    setVisualizando(false)
  }

  function nova() {
    if (salvarTimer.current) clearTimeout(salvarTimer.current)
    // A matéria do filtro já vem escolhida: quem está lendo as anotações de
    // Português e cria uma nova quase sempre quer outra de Português.
    const valores = {
      ...VAZIO,
      materiaId: filtroMateria && filtroMateria !== 'sem' ? filtroMateria : null,
      aulaId: filtroAula || null,
    }
    ultimoSalvo.current = VAZIO
    setRascunho(valores)
    setAbertaId(NOVA)
    setEstado('ocioso')
    setVisualizando(false)
  }

  async function alternarFixada(a: Anotacao) {
    const salva = await repo.salvarAnotacao(a.id, { fixada: !a.fixada })
    setAnotacoes((atual) =>
      (atual ?? [])
        .map((x) => (x.id === a.id ? salva : x))
        .sort((x, y) => Number(y.fixada) - Number(x.fixada) || y.atualizadoEm.localeCompare(x.atualizadoEm)),
    )
  }

  async function excluir() {
    const a = aExcluir
    setAExcluir(null)
    if (!a) return
    if (abertaId === a.id) {
      if (salvarTimer.current) clearTimeout(salvarTimer.current)
      setAbertaId(null)
      setRascunho(VAZIO)
    }
    setAnotacoes((atual) => (atual ?? []).filter((x) => x.id !== a.id))
    await repo.excluirAnotacao(a.id)
  }

  const abertaExistente = abertaId && abertaId !== NOVA ? (anotacoes ?? []).find((a) => a.id === abertaId) : null

  // ------------------------------------------------------------------ tela --
  if (anotacoes === null) return <p className="text-sm text-slate-400">Carregando…</p>

  const editor = abertaId !== null && (
    <div className="flex min-h-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={fechar}
          aria-label="Voltar para a lista"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 lg:hidden"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <input
          value={rascunho.titulo}
          onChange={(e) => setRascunho((r) => ({ ...r, titulo: e.target.value }))}
          placeholder="Título da anotação"
          aria-label="Título da anotação"
          className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-navy outline-none focus:border-brand-blue"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* As duas origens em seções separadas, e não numa lista misturada:
            é comum ter "Português" seu e "Português" da biblioteca, e numa
            lista única os dois viram a mesma linha. */}
        <select
          value={rascunho.materiaId ?? ''}
          onChange={(e) =>
            // Trocar de matéria solta a aula: a aula anterior é de outra
            // matéria, e deixá-la presa seria um vínculo que não existe.
            setRascunho((r) => ({ ...r, materiaId: e.target.value || null, aulaId: null }))
          }
          aria-label="Matéria da anotação"
          className={selectCls}
        >
          <option value="">Sem matéria</option>
          {grupos.minhas.length > 0 && (
            <optgroup label={GRUPO_MINHAS}>
              {grupos.minhas.map((m) => (
                <option key={m.id} value={m.id}>
                  {rotuloDaMateria(m, duplicados)}
                </option>
              ))}
            </optgroup>
          )}
          {grupos.biblioteca.length > 0 && (
            <optgroup label={GRUPO_BIBLIOTECA}>
              {grupos.biblioteca.map((m) => (
                <option key={m.id} value={m.id}>
                  {rotuloDaMateria(m, duplicados)}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* A aula só aparece depois da matéria, e só se ela tiver aulas —
            um select vazio seria uma promessa sem conteúdo. */}
        {aulasDaMateria(rascunho.materiaId).length > 0 && (
          <select
            value={rascunho.aulaId ?? ''}
            onChange={(e) => setRascunho((r) => ({ ...r, aulaId: e.target.value || null }))}
            aria-label="Aula da anotação"
            className={selectCls}
          >
            <option value="">Toda a matéria</option>
            {aulasDaMateria(rascunho.materiaId).map((a) => (
              <option key={a.id} value={a.id}>
                {a.titulo}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setVisualizando((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-600"
        >
          {visualizando ? <Pencil className="h-3.5 w-3.5" strokeWidth={2} /> : <Eye className="h-3.5 w-3.5" strokeWidth={2} />}
          {visualizando ? 'Escrever' : 'Visualizar'}
        </button>

        {/* O estado do salvamento ocupa lugar fixo: um rótulo que aparece e
            some empurraria os botões de lado a cada tecla. */}
        <span className="ml-auto min-w-[7rem] text-right text-xs text-slate-400" aria-live="polite">
          {estado === 'salvando' && 'Salvando…'}
          {estado === 'salvo' && (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Salvo
            </span>
          )}
          {estado === 'erro' && <span className="text-rose-600">Não consegui salvar</span>}
        </span>
      </div>

      {visualizando ? (
        <div className="min-h-[16rem] rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800">
          {rascunho.corpo.trim() ? (
            <TextoComTabelas texto={rascunho.corpo} />
          ) : (
            <p className="text-slate-400">Nada escrito ainda.</p>
          )}
        </div>
      ) : (
        <textarea
          value={rascunho.corpo}
          onChange={(e) => setRascunho((r) => ({ ...r, corpo: e.target.value }))}
          placeholder="Escreva aqui. As quebras de linha são preservadas, e uma tabela em linhas com barras vira tabela de verdade em “Visualizar”."
          aria-label="Conteúdo da anotação"
          className="min-h-[16rem] w-full resize-y rounded-lg border border-slate-300 p-3 text-sm leading-relaxed text-slate-800 outline-none focus:border-brand-blue"
        />
      )}

      {abertaExistente && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-400">Editada {tempoRelativo(abertaExistente.atualizadoEm)}</span>
          <button
            type="button"
            onClick={() => alternarFixada(abertaExistente)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-navy"
          >
            {abertaExistente.fixada ? <PinOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Pin className="h-3.5 w-3.5" strokeWidth={1.75} />}
            {abertaExistente.fixada ? 'Desafixar' : 'Fixar no topo'}
          </button>
          <button
            type="button"
            onClick={() => setAExcluir(abertaExistente)}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Excluir
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-semibold text-navy">{anotacoes.length}</span>{' '}
        {anotacoes.length === 1 ? 'anotação' : 'anotações'} · salvas sozinhas enquanto você escreve.
      </p>

      <div className="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-5">
        {/* No celular a lista dá lugar ao editor; no computador os dois convivem. */}
        <div className={abertaId !== null ? 'hidden lg:block' : ''}>
          <Button onClick={nova} className="mb-3 w-full">
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nova anotação
          </Button>

          <label className="mb-2 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-brand-blue">
            <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no título e no texto…"
              className="w-full min-w-0 text-sm outline-none"
            />
          </label>

          <select
            value={filtroMateria}
            onChange={(e) => {
              setFiltroMateria(e.target.value)
              // Sem isto sobraria uma aula de OUTRA matéria no filtro: a lista
              // zeraria e nada na tela explicaria por quê.
              setFiltroAula('')
            }}
            aria-label="Filtrar por matéria"
            className={`${selectCls} mb-2 w-full`}
          >
            <option value="">Todas as matérias</option>
            <option value="sem">Sem matéria</option>
            {grupos.minhas.length > 0 && (
              <optgroup label={GRUPO_MINHAS}>
                {grupos.minhas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {rotuloDaMateria(m, duplicados)}
                  </option>
                ))}
              </optgroup>
            )}
            {grupos.biblioteca.length > 0 && (
              <optgroup label={GRUPO_BIBLIOTECA}>
                {grupos.biblioteca.map((m) => (
                  <option key={m.id} value={m.id}>
                    {rotuloDaMateria(m, duplicados)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {aulasDaMateria(filtroMateria && filtroMateria !== 'sem' ? filtroMateria : null).length > 0 && (
            <select
              value={filtroAula}
              onChange={(e) => setFiltroAula(e.target.value)}
              aria-label="Filtrar por aula"
              className={`${selectCls} mb-3 w-full`}
            >
              <option value="">Todas as aulas</option>
              {aulasDaMateria(filtroMateria).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titulo}
                </option>
              ))}
            </select>
          )}

          {lista.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-400">
              {anotacoes.length === 0
                ? 'Nenhuma anotação ainda. Crie a primeira aí em cima.'
                : 'Nada encontrado nesta seleção.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {lista.map((a) => {
                const materia = nomeDaMateria(a.materiaId)
                const aula = tituloDaAula(a.aulaId)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => abrir(a)}
                      aria-current={abertaId === a.id ? 'true' : undefined}
                      className={`w-full rounded-xl border p-3 text-left ${
                        abertaId === a.id ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        {a.fixada && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" strokeWidth={2} />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-navy">{a.titulo.trim() || 'Sem título'}</span>
                          {a.corpo.trim() && <span className="mt-0.5 block truncate text-xs text-slate-500">{a.corpo}</span>}
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
                            {materia && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{materia}</span>}
                            {aula && <span className="truncate text-slate-500">{aula}</span>}
                            <span>{tempoRelativo(a.atualizadoEm)}</span>
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className={abertaId === null ? 'hidden lg:block' : ''}>
          {abertaId !== null ? (
            editor
          ) : (
            <EmptyState
              icon={NotebookPen}
              title="Escolha uma anotação"
              description="Ou crie uma nova. O que você escrever é salvo sozinho e fica só na sua conta."
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={aExcluir !== null}
        title="Excluir esta anotação?"
        description={`"${aExcluir?.titulo.trim() || 'Sem título'}" será apagada. Não dá para desfazer — se ela ainda servir para alguma coisa, vale copiar o texto antes.`}
        confirmLabel="Excluir anotação"
        onConfirm={excluir}
        onCancel={() => setAExcluir(null)}
      />
    </div>
  )
}
