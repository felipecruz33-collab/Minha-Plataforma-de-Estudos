import { Info } from 'lucide-react'
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
        <p className="mb-3 text-sm text-slate-500">Escolha onde salvar esta cópia na sua área pessoal.</p>

        {/* Dito AQUI, e não só no cancelamento.
            Descobrir depois que a cópia parou de abrir gera a sensação de ter
            sido enganado — e uma avaliação de uma estrela. Sabendo antes, é um
            combinado. O texto evita "você vai perder": não se perde nada, o
            conteúdo volta inteiro se a assinatura voltar. */}
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" strokeWidth={1.75} />
          <span>
            Esta aula é da biblioteca do Premium. A cópia fica na sua área, mas o conteúdo dela acompanha a
            assinatura: se o Premium for cancelado, ela fica guardada e volta inteira — com as suas respostas —
            quando você reativar. O que você cria a partir dos seus próprios PDFs é seu para sempre.
          </span>
        </p>

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
