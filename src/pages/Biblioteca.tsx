import { BookMarked, Crown, Lock } from 'lucide-react'
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

  async function carregar() {
    setMaterias(await repo.listBiblioteca())
  }

  useEffect(() => {
    if (acessoLiberado) carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acessoLiberado])

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

      {materias === null ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : materias.length === 0 ? (
        <EmptyState icon={BookMarked} title="A biblioteca ainda não tem conteúdo" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {materias.map((m) => (
            <Link key={m.id} to={`/biblioteca/${m.id}`}>
              <Card className="flex items-start gap-3">
                <div className="rounded-lg bg-brand-gradient p-2.5">
                  <BookMarked className="h-5 w-5 text-white" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{m.nome}</p>
                  <p className="text-xs text-slate-400">
                    {m.numAulas} {m.numAulas === 1 ? 'aula' : 'aulas'}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
