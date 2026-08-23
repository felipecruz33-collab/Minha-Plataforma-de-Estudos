import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { repo, type MateriaComContagem } from '../lib/repo'

export type ModoMateria = 'auto' | 'existente' | 'nova'

export interface EscolhaMateria {
  modo: ModoMateria
  materiaId?: string
  nome?: string
}

/** Resolve a escolha do usuário para o nome que deve sobrescrever "materia" no payload — undefined = deixar automático. */
export function resolverNomeMateria(escolha: EscolhaMateria): string | undefined {
  if (escolha.modo === 'existente') return escolha.nome
  if (escolha.modo === 'nova') return escolha.nome?.trim() || undefined
  return undefined
}

interface MateriaPickerProps {
  /** Lista matérias da Biblioteca (admin gerindo o catálogo) ou as matérias pessoais do usuário. */
  isBiblioteca: boolean
  autoLabel: string
  value: EscolhaMateria
  onChange: (v: EscolhaMateria) => void
}

export function MateriaPicker({ isBiblioteca, autoLabel, value, onChange }: MateriaPickerProps) {
  const { user } = useAuth()
  const [materias, setMaterias] = useState<MateriaComContagem[]>([])

  useEffect(() => {
    if (isBiblioteca) {
      repo.listBiblioteca().then(setMaterias)
    } else if (user) {
      repo.listMaterias(user.id).then(setMaterias)
    }
  }, [isBiblioteca, user])

  const inputCls = 'w-[calc(100%-1.625rem)] rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-blue'

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-600">Matéria de destino</span>
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            className="mt-0.5"
            checked={value.modo === 'auto'}
            onChange={() => onChange({ modo: 'auto' })}
          />
          {autoLabel}
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            className="mt-0.5"
            checked={value.modo === 'existente'}
            disabled={materias.length === 0}
            onChange={() => onChange({ modo: 'existente', materiaId: materias[0]?.id, nome: materias[0]?.nome })}
          />
          Matéria já existente{materias.length === 0 && ' (você ainda não tem nenhuma)'}
        </label>
        {value.modo === 'existente' && (
          <select
            className={`ml-6 ${inputCls}`}
            value={value.materiaId ?? ''}
            onChange={(e) => {
              const m = materias.find((mm) => mm.id === e.target.value)
              onChange({ modo: 'existente', materiaId: m?.id, nome: m?.nome })
            }}
          >
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="radio"
            className="mt-0.5"
            checked={value.modo === 'nova'}
            onChange={() => onChange({ modo: 'nova', nome: '' })}
          />
          Criar matéria nova
        </label>
        {value.modo === 'nova' && (
          <input
            type="text"
            autoFocus
            placeholder="Nome da nova matéria"
            className={`ml-6 ${inputCls}`}
            value={value.nome ?? ''}
            onChange={(e) => onChange({ modo: 'nova', nome: e.target.value })}
          />
        )}
      </div>
    </div>
  )
}
