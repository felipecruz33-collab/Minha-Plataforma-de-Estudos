import { ArrowLeft, BookOpenText, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { Aula } from '../lib/types'

export default function MateriaDetail() {
  const { materiaId } = useParams<{ materiaId: string }>()
  const location = useLocation()
  const isBiblioteca = location.pathname.startsWith('/biblioteca')
  const { perfil } = useAuth()
  const podeGerir = isBiblioteca ? !!perfil?.isAdmin : true

  const [aulas, setAulas] = useState<Aula[] | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Aula | null>(null)

  async function carregar() {
    if (!materiaId) return
    setAulas(await repo.listAulas(materiaId))
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materiaId])

  async function confirmarExclusao() {
    if (!paraExcluir) return
    await repo.deleteAula(paraExcluir.id)
    setParaExcluir(null)
    carregar()
  }

  const voltarPara = isBiblioteca ? '/biblioteca' : '/'

  return (
    <div>
      <Link to={voltarPara} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy">
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Voltar
      </Link>

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
    </div>
  )
}
