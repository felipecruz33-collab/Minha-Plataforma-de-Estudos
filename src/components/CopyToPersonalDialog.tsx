import { useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { copiarAulaParaMinhaBiblioteca } from '../lib/copiarAula'
import type { Aula } from '../lib/types'
import { MateriaPicker, resolverNomeMateria, type EscolhaMateria } from './MateriaPicker'
import { Button } from './ui/Button'

interface CopyToPersonalDialogProps {
  aula: Aula | null
  materiaOrigemNome: string
  onClose: () => void
  onCopied: (aulaId: string) => void
}

export function CopyToPersonalDialog({ aula, materiaOrigemNome, onClose, onCopied }: CopyToPersonalDialogProps) {
  const { user } = useAuth()
  const [escolha, setEscolha] = useState<EscolhaMateria>({ modo: 'auto' })
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!aula) return null

  async function confirmar() {
    if (!user || !aula) return
    if (escolha.modo === 'nova' && !escolha.nome?.trim()) {
      setErro('Digite um nome para a nova matéria.')
      return
    }
    setBusy(true)
    setErro(null)
    try {
      const nome = resolverNomeMateria(escolha) ?? materiaOrigemNome
      await copiarAulaParaMinhaBiblioteca(user.id, aula, nome)
      onCopied(aula.id)
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível copiar esta aula.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="mb-1 text-base font-bold text-navy">Copiar "{aula.titulo}"</h2>
        <p className="mb-4 text-sm text-slate-500">Escolha onde salvar esta cópia na sua área pessoal.</p>

        <MateriaPicker
          isBiblioteca={false}
          autoLabel={`Usar "${materiaOrigemNome}" (mesmo nome do original)`}
          value={escolha}
          onChange={setEscolha}
        />

        {erro && <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{erro}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={busy}>
            {busy ? 'Copiando…' : 'Copiar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
