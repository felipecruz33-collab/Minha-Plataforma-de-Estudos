import { BookOpenCheck, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { QuestionCard } from '../components/QuestionCard'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, type MateriaComContagem } from '../lib/repo'
import type { Aula, Questao } from '../lib/types'

interface QuestaoComOrigem extends Questao {
  materiaNome: string
  origem: 'pessoal' | 'biblioteca'
}

function useSelect() {
  const [value, setValue] = useState('')
  return [value, setValue] as const
}

export default function Questoes() {
  const { user, perfil } = useAuth()
  const [questoes, setQuestoes] = useState<QuestaoComOrigem[]>([])
  const [busca, setBusca] = useState('')
  const [materia, setMateria] = useSelect()
  const [banca, setBanca] = useSelect()
  const [ano, setAno] = useSelect()
  const [assunto, setAssunto] = useSelect()

  useEffect(() => {
    if (!user) return
    const podeVerBiblioteca = !!perfil?.isPremium || !!perfil?.isAdmin

    Promise.all([
      repo.listMaterias(user.id),
      podeVerBiblioteca ? repo.listBiblioteca() : Promise.resolve<MateriaComContagem[]>([]),
    ]).then(async ([minhas, biblio]) => {
      const nomePorId = new Map([...minhas, ...biblio].map((m) => [m.id, m.nome]))
      const origemPorId = new Map<string, 'pessoal' | 'biblioteca'>([
        ...minhas.map((m): [string, 'pessoal'] => [m.id, 'pessoal']),
        ...biblio.map((m): [string, 'biblioteca'] => [m.id, 'biblioteca']),
      ])
      const aulasPessoais = (await Promise.all(minhas.map((m) => repo.listAulas(m.id)))).flat()
      const aulasBiblio = (await Promise.all(biblio.map((m) => repo.listAulas(m.id)))).flat()
      const todas: Aula[] = [...aulasPessoais, ...aulasBiblio]
      const comOrigem: QuestaoComOrigem[] = todas.flatMap((a) =>
        a.questoes.map((q) => ({
          ...q,
          materiaNome: nomePorId.get(a.materiaId) ?? '',
          origem: origemPorId.get(a.materiaId) ?? 'pessoal',
        })),
      )
      setQuestoes(comOrigem)
    })
  }, [user, perfil?.isPremium, perfil?.isAdmin])

  const opcoes = useMemo(
    () => ({
      materias: Array.from(new Set(questoes.map((q) => q.materiaNome))).sort(),
      bancas: Array.from(new Set(questoes.map((q) => q.banca).filter(Boolean))).sort(),
      anos: Array.from(new Set(questoes.map((q) => q.ano).filter(Boolean))).sort().reverse(),
      assuntos: Array.from(new Set(questoes.map((q) => q.tema).filter(Boolean))).sort(),
    }),
    [questoes],
  )

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return questoes.filter((q) => {
      if (materia && q.materiaNome !== materia) return false
      if (banca && q.banca !== banca) return false
      if (ano && q.ano !== ano) return false
      if (assunto && q.tema !== assunto) return false
      if (termo && !q.enunciado.toLowerCase().includes(termo)) return false
      return true
    })
  }, [questoes, busca, materia, banca, ano, assunto])

  const selectCls = 'rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-brand-blue'

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        <span className="font-semibold text-navy">{questoes.length}</span> questões no seu banco.
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

      <div className="mb-5 flex flex-wrap gap-2">
        <select value={materia} onChange={(e) => setMateria(e.target.value)} className={selectCls}>
          <option value="">Todas as matérias</option>
          {opcoes.materias.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
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

      {filtradas.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="Nenhuma questão encontrada" />
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
              <QuestionCard questao={q} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
