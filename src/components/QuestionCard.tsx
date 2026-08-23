import { Star } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { repo } from '../lib/repo'
import type { Questao } from '../lib/types'
import { Card } from './ui/Card'

interface QuestionCardProps {
  questao: Questao
  onRespondida?: (correta: boolean) => void
}

export function QuestionCard({ questao, onRespondida }: QuestionCardProps) {
  const { user, perfil, toggleFavorito } = useAuth()
  const [escolha, setEscolha] = useState<string | null>(null)
  const [respondida, setRespondida] = useState(false)

  const favorita = perfil?.favoritos.includes(questao.id) ?? false

  async function responder(altId: string) {
    if (respondida || !user) return
    setEscolha(altId)
    setRespondida(true)
    const correta = altId === questao.gabarito
    await repo.registrarResposta({
      userId: user.id,
      questaoId: questao.id,
      aulaId: questao.aulaId,
      materiaId: questao.materiaId,
      alternativaEscolhida: altId,
      correta,
    })
    onRespondida?.(correta)
  }

  const metaInfo = [questao.banca, questao.orgao, questao.ano].filter(Boolean).join(' · ')

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs text-slate-400">
          {questao.tema && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{questao.tema}</span>}
          {metaInfo && <span>{metaInfo}</span>}
        </div>
        <button
          type="button"
          onClick={() => toggleFavorito(questao.id)}
          aria-label="Favoritar"
          className="shrink-0"
        >
          <Star
            className={`h-5 w-5 ${favorita ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
            strokeWidth={1.75}
          />
        </button>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-slate-800">{questao.enunciado}</p>

      <div className="space-y-2">
        {questao.alternativas.map((alt) => {
          const isEscolha = escolha === alt.id
          const isGabarito = alt.id === questao.gabarito
          let classes = 'border-slate-200 hover:border-brand-blue'
          if (respondida) {
            if (isGabarito) classes = 'border-emerald-400 bg-emerald-50'
            else if (isEscolha) classes = 'border-rose-400 bg-rose-50'
            else classes = 'border-slate-200 opacity-60'
          }
          return (
            <button
              key={alt.id}
              type="button"
              disabled={respondida}
              onClick={() => responder(alt.id)}
              className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${classes}`}
            >
              <span className="font-bold text-navy">{alt.id}</span>
              <span className="text-slate-700">{alt.texto}</span>
            </button>
          )
        })}
      </div>

      {respondida && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p className={escolha === questao.gabarito ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
            {escolha === questao.gabarito ? 'Você acertou!' : `Gabarito: ${questao.gabarito}`}
          </p>
          {questao.explicacao && <p className="text-slate-600">{questao.explicacao}</p>}
          {questao.altExp[escolha ?? ''] && <p className="text-slate-500">{questao.altExp[escolha ?? '']}</p>}
        </div>
      )}
    </Card>
  )
}
