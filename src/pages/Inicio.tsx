import { BookOpen, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, type MateriaComContagem } from '../lib/repo'

export default function Inicio() {
  const { user } = useAuth()
  const [materias, setMaterias] = useState<MateriaComContagem[] | null>(null)
  const [paraExcluir, setParaExcluir] = useState<MateriaComContagem | null>(null)

  async function carregar() {
    if (!user) return
    setMaterias(await repo.listMaterias(user.id))
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function confirmarExclusao() {
    if (!paraExcluir) return
    await repo.deleteMateria(paraExcluir.id)
    setParaExcluir(null)
    carregar()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Cada arquivo .json importado vira uma aula dentro da matéria correspondente. Nada é sobrescrito.
        </p>
      </div>

      <div className="mb-5">
        <Link to="/adicionar">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Adicionar conteúdo
          </Button>
        </Link>
      </div>

      {materias === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : materias.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Você ainda não tem matérias"
          description='Importe um PDF ou um arquivo .json em "Adicionar conteúdo" para começar sua biblioteca.'
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {materias.map((m) => (
            <Card key={m.id} className="flex flex-col gap-3">
              <Link to={`/materias/${m.id}`} className="flex items-start gap-3">
                <div className="rounded-lg bg-brand-gradient p-2.5">
                  <BookOpen className="h-5 w-5 text-white" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{m.nome}</p>
                  <p className="text-xs text-slate-400">
                    {m.numAulas} {m.numAulas === 1 ? 'aula' : 'aulas'}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setParaExcluir(m)}
                className="flex items-center gap-1.5 self-end text-xs font-medium text-rose-500 hover:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Excluir matéria
              </button>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!paraExcluir}
        title={`Excluir "${paraExcluir?.nome}"?`}
        description="Todas as aulas, blocos de conteúdo e questões desta matéria serão excluídos permanentemente."
        onConfirm={confirmarExclusao}
        onCancel={() => setParaExcluir(null)}
      />
    </div>
  )
}
