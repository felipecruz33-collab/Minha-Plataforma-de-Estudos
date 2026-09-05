import { BookMarked, Check, Crown, Lock, Pencil, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImportPanel } from '../components/ImportPanel'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { podeVerBiblioteca } from '../lib/premium'
import { repo, type MateriaComContagem } from '../lib/repo'

export default function Biblioteca() {
  const { perfil } = useAuth()
  const [materias, setMaterias] = useState<MateriaComContagem[] | null>(null)
  const acessoLiberado = podeVerBiblioteca(perfil)

  /** Qual matéria está com o nome aberto para edição, e o texto em digitação. */
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function carregar() {
    setMaterias(await repo.listBiblioteca())
  }

  useEffect(() => {
    if (acessoLiberado) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acessoLiberado])

  function abrirRenomear(m: MateriaComContagem) {
    setRenomeando(m.id)
    setRascunho(m.nome)
    setErro(null)
  }

  async function salvarNome(m: MateriaComContagem) {
    const novo = rascunho.trim()
    // Nome vazio não é renomear, é apagar o nome. E salvar o mesmo texto de
    // novo só gastaria uma ida ao banco pra não mudar nada.
    if (!novo || novo === m.nome) {
      setRenomeando(null)
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await repo.renomearMateria(m.id, novo)
      // Troca na lista em memória em vez de recarregar tudo: o nome é a única
      // coisa que mudou, e recarregar piscaria a tela inteira.
      setMaterias((atual) => atual?.map((x) => (x.id === m.id ? { ...x, nome: novo } : x)) ?? atual)
      setRenomeando(null)
    } catch {
      // Quem recusa de verdade é a RLS: só o administrador escreve na
      // biblioteca. A tela apenas não oferece o lápis pros outros.
      setErro('Não foi possível renomear. Tente de novo em instantes.')
    } finally {
      setSalvando(false)
    }
  }

  if (!acessoLiberado) {
    return (
      <EmptyState icon={Lock} title="Biblioteca compartilhada é exclusiva para assinantes Premium">
        <Link to="/premium">
          <Button>
            <Crown className="h-4 w-4" strokeWidth={2} />
            Conhecer o Premium
          </Button>
        </Link>
      </EmptyState>
    )
  }

  return (
    <div>
      <p className="mb-5 text-sm text-slate-500">Catálogo curado, com aulas novas adicionadas periodicamente.</p>

      {perfil?.isAdmin && (
        <details className="mb-6 rounded-xl border border-brand-indigo/30 bg-indigo-50/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand-indigo">
            Gestão da biblioteca (administrador)
          </summary>
          <div className="mt-4">
            <ImportPanel isBiblioteca onImported={carregar} />
          </div>
        </details>
      )}

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}

      {materias === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : materias.length === 0 ? (
        <EmptyState icon={BookMarked} title="A biblioteca ainda não tem conteúdo" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {materias.map((m) =>
            renomeando === m.id ? (
              <Card key={m.id} className="flex items-center gap-2">
                <input
                  autoFocus
                  value={rascunho}
                  onChange={(e) => setRascunho(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarNome(m)
                    if (e.key === 'Escape') setRenomeando(null)
                  }}
                  aria-label="Nome da matéria"
                  className="w-full min-w-0 rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-semibold text-navy outline-none focus:border-brand-blue"
                />
                <button
                  type="button"
                  onClick={() => salvarNome(m)}
                  disabled={salvando}
                  aria-label="Salvar nome"
                  className="shrink-0 rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => setRenomeando(null)}
                  aria-label="Cancelar"
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </Card>
            ) : (
              <Card key={m.id} className="flex items-start gap-3">
                {/* O link envolve só o conteúdo, e não o cartão inteiro: botão
                    dentro de link não é HTML válido, e o clique de renomear
                    acabaria navegando junto. */}
                <Link to={`/biblioteca/${m.id}`} className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="rounded-lg bg-brand-gradient p-2.5">
                    <BookMarked className="h-5 w-5 text-white" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-navy">{m.nome}</p>
                    <p className="text-xs text-slate-400">
                      {m.numAulas} {m.numAulas === 1 ? 'aula' : 'aulas'}
                    </p>
                  </div>
                </Link>
                {perfil?.isAdmin && (
                  <button
                    type="button"
                    onClick={() => abrirRenomear(m)}
                    aria-label={`Renomear ${m.nome}`}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-blue"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                )}
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  )
}
