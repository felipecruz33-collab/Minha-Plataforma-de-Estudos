import { ArrowLeft, BookOpenText, Check, Copy, Lock, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { CopyToPersonalDialog } from '../components/CopyToPersonalDialog'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { Aula, Materia } from '../lib/types'

export default function MateriaDetail() {
  const { materiaId } = useParams<{ materiaId: string }>()
  const location = useLocation()
  const isBiblioteca = location.pathname.startsWith('/biblioteca')
  const { perfil } = useAuth()
  const podeVerBiblioteca = !!perfil?.isPremium || !!perfil?.isAdmin
  const podeGerir = isBiblioteca ? !!perfil?.isAdmin : true
  const acessoLiberado = !isBiblioteca || podeVerBiblioteca

  const [materia, setMateria] = useState<Materia | null>(null)
  const [aulas, setAulas] = useState<Aula[] | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Aula | null>(null)
  const [paraCopiar, setParaCopiar] = useState<Aula | null>(null)
  const [copiadas, setCopiadas] = useState<Set<string>>(new Set())

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

      {aulas === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : aulas.length === 0 ? (
        <EmptyState icon={BookOpenText} title="Nenhuma aula nesta matéria ainda" />
      ) : (
        <div className="space-y-2">
          {aulas.map((a) => (
            <Card key={a.id} className="flex items-center justify-between gap-3">
              <Link to={`/aulas/${a.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2.5">
                  <BookOpenText className="h-4 w-4 text-navy" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{a.titulo}</p>
                  <p className="text-xs text-slate-400">
                    {a.blocos.length} bloco{a.blocos.length !== 1 ? 's' : ''} · {a.questoes.length} questão
                    {a.questoes.length !== 1 ? 'ões' : ''}
                  </p>
                </div>
              </Link>
              {isBiblioteca && (
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
              {podeGerir && (
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
