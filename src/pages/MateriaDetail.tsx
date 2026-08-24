import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  BookOpenText,
  CalendarClock,
  Check,
  Copy,
  GripVertical,
  Lock,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CopyToPersonalDialog } from '../components/CopyToPersonalDialog'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { compararTitulos } from '../lib/ordenarAulas'
import { podeVerBiblioteca as calcPodeVerBiblioteca } from '../lib/premium'
import { repo } from '../lib/repo'
import type { Aula, Materia } from '../lib/types'

export default function MateriaDetail() {
  const { materiaId } = useParams<{ materiaId: string }>()
  const location = useLocation()
  const isBiblioteca = location.pathname.startsWith('/biblioteca')
  const { perfil } = useAuth()
  const podeVerBiblioteca = calcPodeVerBiblioteca(perfil)
  const podeGerir = isBiblioteca ? !!perfil?.isAdmin : true
  const acessoLiberado = !isBiblioteca || podeVerBiblioteca

  const [materia, setMateria] = useState<Materia | null>(null)
  const [aulas, setAulas] = useState<Aula[] | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Aula | null>(null)
  const [paraCopiar, setParaCopiar] = useState<Aula | null>(null)
  const [copiadas, setCopiadas] = useState<Set<string>>(new Set())

  const [organizando, setOrganizando] = useState(false)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [tituloEditado, setTituloEditado] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  // Guarda o elemento de cada linha pra saber, durante o arraste, sobre qual
  // delas o dedo está. Medir na hora é mais confiável do que assumir altura
  // fixa: os títulos quebram em mais de uma linha e mudam a altura do item.
  const refsLinhas = useRef(new Map<string, HTMLDivElement>())

  async function carregar() {
    if (!materiaId || !acessoLiberado) return
    const [m, a] = await Promise.all([repo.getMateria(materiaId), repo.listAulas(materiaId)])
    setMateria(m)
    setAulas(a)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materiaId, acessoLiberado])

  async function confirmarExclusao() {
    if (!paraExcluir) return
    await repo.deleteAula(paraExcluir.id)
    setParaExcluir(null)
    carregar()
  }

  /**
   * Aplica uma nova ordem na tela primeiro e só depois grava.
   *
   * O contrário (esperar o banco) deixaria a lista congelada a cada toque, o
   * que num celular parece travamento. Se a gravação falhar, a lista volta
   * pro que o banco tem de verdade — nada de deixar na tela uma ordem que não
   * foi salva.
   */
  async function aplicarOrdem(nova: Aula[]) {
    if (!materiaId) return
    const anterior = aulas
    setAulas(nova.map((a, i) => ({ ...a, ordem: i })))
    setErro(null)
    try {
      await repo.reordenarAulas(
        materiaId,
        nova.map((a) => a.id),
      )
    } catch (err) {
      setAulas(anterior)
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar a nova ordem.')
    }
  }

  function mover(indice: number, direcao: -1 | 1) {
    if (!aulas) return
    const destino = indice + direcao
    if (destino < 0 || destino >= aulas.length) return
    const nova = [...aulas]
    ;[nova[indice], nova[destino]] = [nova[destino], nova[indice]]
    aplicarOrdem(nova)
  }

  function ordenarPor(criterio: 'titulo' | 'data') {
    if (!aulas) return
    const nova = [...aulas].sort((a, b) =>
      criterio === 'titulo' ? compararTitulos(a.titulo, b.titulo) : a.criadoEm.localeCompare(b.criadoEm),
    )
    aplicarOrdem(nova)
  }

  async function salvarTitulo(aula: Aula) {
    const novo = tituloEditado.trim()
    if (!novo || novo === aula.titulo) {
      setRenomeando(null)
      return
    }
    setErro(null)
    try {
      await repo.renomearAula(aula.id, novo)
      setAulas((prev) => prev?.map((a) => (a.id === aula.id ? { ...a, titulo: novo } : a)) ?? prev)
      setRenomeando(null)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível renomear a aula.')
    }
  }

  // --- Arrastar para reordenar -------------------------------------------
  // Usa Pointer Events (e não a API de drag-and-drop do HTML) porque aquela
  // simplesmente não dispara em toque — e este app é usado no celular.
  // O `touch-action: none` na alça é o que impede a página de rolar enquanto
  // o dedo arrasta a aula.

  function aoArrastar(clientY: number) {
    if (!arrastando || !aulas) return
    const atual = aulas.findIndex((a) => a.id === arrastando)
    if (atual === -1) return
    const alvo = aulas.findIndex((a) => {
      const el = refsLinhas.current.get(a.id)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return clientY >= r.top && clientY <= r.bottom
    })
    if (alvo === -1 || alvo === atual) return
    const nova = [...aulas]
    const [item] = nova.splice(atual, 1)
    nova.splice(alvo, 0, item)
    setAulas(nova)
  }

  function encerrarArraste() {
    if (!arrastando || !aulas) return
    setArrastando(null)
    aplicarOrdem(aulas)
  }

  const voltarPara = isBiblioteca ? '/biblioteca' : '/'

  if (!acessoLiberado) {
    return (
      <EmptyState icon={Lock} title="Biblioteca compartilhada é exclusiva para assinantes Premium">
        <Link to="/premium">
          <Button>Conhecer o Premium</Button>
        </Link>
      </EmptyState>
    )
  }

  return (
    <div>
      <Link to={voltarPara} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Voltar
      </Link>

      {isBiblioteca && (
        <p className="mb-4 text-sm text-slate-500">
          Toque em <Copy className="inline h-3.5 w-3.5" strokeWidth={2} /> para copiar uma aula para a sua área
          pessoal — a cópia é independente e pode ser excluída depois em "Início", sem afetar a Biblioteca.
        </p>
      )}

      {podeGerir && aulas && aulas.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            variant={organizando ? 'primary' : 'secondary'}
            onClick={() => {
              setOrganizando((v) => !v)
              setRenomeando(null)
            }}
          >
            <ArrowUpDown className="h-4 w-4" strokeWidth={1.75} />
            {organizando ? 'Concluir' : 'Organizar'}
          </Button>
          {organizando && (
            <>
              <Button variant="secondary" onClick={() => ordenarPor('titulo')}>
                A–Z
              </Button>
              <Button variant="secondary" onClick={() => ordenarPor('data')}>
                <CalendarClock className="h-4 w-4" strokeWidth={1.75} />
                Por data
              </Button>
            </>
          )}
        </div>
      )}

      {organizando && (
        <p className="mb-3 text-sm text-slate-500">
          Arraste pela alça <GripVertical className="inline h-3.5 w-3.5" strokeWidth={1.75} /> ou use as setas para
          mudar a posição. Toque no lápis <Pencil className="inline h-3.5 w-3.5" strokeWidth={1.75} /> para renomear.
          A ordem é salva sozinha.
        </p>
      )}

      {erro && (
        <p className="mb-3 flex items-start gap-1.5 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span>{erro}</span>
        </p>
      )}

      {aulas === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : aulas.length === 0 ? (
        <EmptyState icon={BookOpenText} title="Nenhuma aula nesta matéria ainda" />
      ) : (
        <div className="space-y-2">
          {aulas.map((a, i) => (
            <Card
              key={a.id}
              ref={(el: HTMLDivElement | null) => {
                if (el) refsLinhas.current.set(a.id, el)
                else refsLinhas.current.delete(a.id)
              }}
              className={`flex items-center gap-2 ${arrastando === a.id ? 'opacity-60 ring-2 ring-brand-blue' : ''}`}
            >
              {organizando && (
                <span
                  data-arrastar={a.id}
                  aria-hidden="true"
                  className="-ml-1 shrink-0 cursor-grab touch-none p-1 text-slate-400 active:cursor-grabbing"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setArrastando(a.id)
                  }}
                  onPointerMove={(e) => aoArrastar(e.clientY)}
                  onPointerUp={encerrarArraste}
                  onPointerCancel={encerrarArraste}
                >
                  <GripVertical className="h-5 w-5" strokeWidth={1.75} />
                </span>
              )}

              {renomeando === a.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input
                    autoFocus
                    value={tituloEditado}
                    onChange={(e) => setTituloEditado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') salvarTitulo(a)
                      if (e.key === 'Escape') setRenomeando(null)
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-brand-blue px-2.5 py-1.5 text-sm outline-none"
                    aria-label="Novo título da aula"
                  />
                  <button
                    type="button"
                    onClick={() => salvarTitulo(a)}
                    className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50"
                    aria-label="Salvar título"
                  >
                    <Check className="h-4 w-4" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenomeando(null)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                    aria-label="Cancelar"
                  >
                    <X className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <Link to={`/aulas/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="rounded-lg bg-slate-100 p-2.5">
                    <BookOpenText className="h-4 w-4 text-navy" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy">{a.titulo}</p>
                    <p className="text-xs text-slate-400">
                      {a.blocos.length} {a.blocos.length === 1 ? 'bloco' : 'blocos'} · {a.questoes.length}{' '}
                      {a.questoes.length === 1 ? 'questão' : 'questões'}
                    </p>
                  </div>
                </Link>
              )}

              {organizando && renomeando !== a.id && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setRenomeando(a.id)
                      setTituloEditado(a.titulo)
                    }}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy"
                    aria-label={`Renomear "${a.titulo}"`}
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-navy disabled:opacity-30"
                      aria-label="Mover para cima"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, 1)}
                      disabled={i === aulas.length - 1}
                      className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-navy disabled:opacity-30"
                      aria-label="Mover para baixo"
                    >
                      <ArrowDown className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </>
              )}

              {!organizando && isBiblioteca && (
                <button
                  type="button"
                  onClick={() => setParaCopiar(a)}
                  className="rounded-lg p-2 text-brand-indigo hover:bg-indigo-50 disabled:opacity-50"
                  aria-label="Copiar para minha biblioteca"
                  title="Copiar para minha biblioteca"
                >
                  {copiadas.has(a.id) ? (
                    <Check className="h-4 w-4 text-emerald-500" strokeWidth={2} />
                  ) : (
                    <Copy className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>
              )}
              {!organizando && podeGerir && (
                <button
                  type="button"
                  onClick={() => setParaExcluir(a)}
                  className="rounded-lg p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Excluir aula"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!paraExcluir}
        title={`Excluir "${paraExcluir?.titulo}"?`}
        description="Essa aula e todas as questões associadas serão excluídas permanentemente."
        onConfirm={confirmarExclusao}
        onCancel={() => setParaExcluir(null)}
      />

      <CopyToPersonalDialog
        aula={paraCopiar}
        materiaOrigemNome={materia?.nome ?? ''}
        onClose={() => setParaCopiar(null)}
        onCopied={(aulaId) => setCopiadas((prev) => new Set(prev).add(aulaId))}
      />
    </div>
  )
}
