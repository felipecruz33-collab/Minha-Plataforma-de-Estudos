import { BookOpenText, Search as SearchIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { Aula } from '../lib/types'

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function Buscar() {
  const { user } = useAuth()
  const [termo, setTermo] = useState('')
  const [aulas, setAulas] = useState<Aula[]>([])

  useEffect(() => {
    if (!user) return
    repo.listTodasAulas(user.id, true).then(setAulas)
  }, [user])

  const resultados = useMemo(() => {
    const q = termo.trim().toLowerCase()
    if (!q) return []
    return aulas
      .map((aula) => {
        const tituloMatch = aula.titulo.toLowerCase().includes(q)
        const blocoMatch = aula.blocos.find((b) => stripHtml(b.html).toLowerCase().includes(q))
        const questaoMatch = aula.questoes.find((qs) => qs.enunciado.toLowerCase().includes(q))
        if (!tituloMatch && !blocoMatch && !questaoMatch) return null
        return { aula, trecho: questaoMatch?.enunciado ?? (blocoMatch ? stripHtml(blocoMatch.html) : aula.titulo) }
      })
      .filter((r): r is { aula: Aula; trecho: string } => r !== null)
  }, [aulas, termo])

  return (
    <div>
      <label className="mb-5 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 focus-within:border-brand-blue">
        <SearchIcon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
        <input
          autoFocus
          type="text"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar em todo o seu conteúdo…"
          className="w-full text-sm outline-none"
        />
      </label>

      {!termo ? (
        <EmptyState icon={SearchIcon} title="Busque por aulas, teoria ou questões" />
      ) : resultados.length === 0 ? (
        <EmptyState icon={SearchIcon} title="Nada encontrado" />
      ) : (
        <div className="space-y-2">
          {resultados.map(({ aula, trecho }) => (
            <Link key={aula.id} to={`/aulas/${aula.id}`}>
              <Card className="flex items-start gap-3">
                <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-navy">{aula.titulo}</p>
                  <p className="truncate text-xs text-slate-400">{trecho}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
