import { BarChart3, CalendarRange, Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { CarregarMais } from '../components/ui/CarregarMais'
import { EmptyState } from '../components/ui/EmptyState'
import { useAuth } from '../lib/auth/AuthContext'
import {
  extratoDeAcompanhamento,
  projecaoPorMateria,
  JANELA_DIAS,
  type EventoExtrato,
  type ProjecaoMateria,
} from '../lib/acompanhamento'
import { calibracao, CERTEZA_ESPERADA } from '../lib/calibracao'
import { useListaVisivel } from '../lib/hooks/useListaVisivel'
import { useTodasQuestoes } from '../lib/hooks/useTodasQuestoes'
import { repo } from '../lib/repo'
import type { Resposta } from '../lib/types'

interface Grupo {
  nome: string
  total: number
  acertos: number
}

function Barra({ grupo }: { grupo: Grupo }) {
  const pct = grupo.total ? Math.round((grupo.acertos / grupo.total) * 100) : 0
  const cor = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="truncate font-medium text-slate-700">{grupo.nome}</span>
        <span className="shrink-0 text-slate-400">
          {grupo.acertos}/{grupo.total} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Calibração: o cruzamento entre o que a pessoa SENTIA e o que ela acertou.
 *
 * Só aparece para quem usa o modo confiança — sem a declaração não existe
 * nada para cruzar, e uma caixa vazia prometendo diagnóstico é pior do que
 * caixa nenhuma.
 */
function PainelCalibracao({ respostas }: { respostas: Resposta[] }) {
  const dados = useMemo(() => calibracao(respostas), [respostas])
  if (dados.comConfianca === 0) return null

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
        <Gauge className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
        Calibração
      </h2>
      <Card className="space-y-3">
        <p className="text-xs text-slate-500">
          O quanto a sua sensação de saber bate com o que você acerta, nas{' '}
          <strong className="text-navy">{dados.comConfianca}</strong>{' '}
          {dados.comConfianca === 1 ? 'resposta' : 'respostas'} em que você declarou a certeza. Quem perde vaga em
          concurso disputado raramente erra o que sabe que não sabe — erra o que achava que sabia.
        </p>

        <div className="space-y-1.5">
          {dados.faixas
            .filter((f) => f.total > 0)
            .map((f) => {
              // A referência muda por faixa: 90% é o esperado de quem diz ter
              // certeza, e seria uma meta absurda para quem declarou chute.
              const bom = f.grau === 'certeza' ? f.pct >= CERTEZA_ESPERADA : f.grau === 'duvida' ? f.pct >= 60 : true
              const cor = f.grau === 'chute' ? 'bg-slate-400' : bom ? 'bg-emerald-500' : 'bg-rose-500'
              return (
                <div key={f.grau} className="py-1">
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-slate-700">{f.rotulo}</span>
                    <span className="shrink-0 text-slate-400">
                      {f.acertos}/{f.total} ({f.pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${cor}`} style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              )
            })}
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs">
          {dados.pctSemSorte !== null && (
            <span className="text-slate-500">
              Aproveitamento sem a sorte: <strong className="text-navy">{dados.pctSemSorte}%</strong>
            </span>
          )}
          {dados.acertosChutados > 0 && (
            <span className="text-slate-500">
              Acertos chutados: <strong className="text-navy">{dados.acertosChutados}</strong>
            </span>
          )}
          {dados.errosComCerteza > 0 && (
            <span className="text-rose-600">
              Errou com certeza: <strong>{dados.errosComCerteza}</strong>
            </span>
          )}
        </div>

        {dados.recado && (
          <p
            className={`rounded-lg p-3 text-xs ${
              dados.recado.tom === 'alerta'
                ? 'bg-rose-50 text-rose-700'
                : dados.recado.tom === 'bom'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-50 text-slate-600'
            }`}
          >
            {dados.recado.texto}
          </p>
        )}
      </Card>
    </section>
  )
}

function agrupar(respostas: Resposta[], keyFn: (r: Resposta) => string, nomeFn: (key: string) => string): Grupo[] {
  const mapa = new Map<string, { total: number; acertos: number }>()
  for (const r of respostas) {
    const key = keyFn(r)
    const atual = mapa.get(key) ?? { total: 0, acertos: 0 }
    atual.total += 1
    if (r.correta) atual.acertos += 1
    mapa.set(key, atual)
  }
  return Array.from(mapa.entries())
    .map(([key, v]) => ({ nome: nomeFn(key), total: v.total, acertos: v.acertos }))
    .sort((a, b) => b.total - a.total)
}

/** Uma linha do extrato: data à esquerda, o que mudou à direita. */
function LinhaExtrato({ evento }: { evento: EventoExtrato }) {
  const Icone = evento.tom === 'bom' ? TrendingUp : evento.tom === 'ruim' ? TrendingDown : Minus
  const cor = evento.tom === 'bom' ? 'text-emerald-600' : evento.tom === 'ruim' ? 'text-rose-600' : 'text-slate-400'
  const [, mes, dia] = evento.em.split('-')
  return (
    <div className="flex gap-3 border-t border-slate-100 py-3 first:border-t-0 first:pt-0">
      <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-400">
        {dia}/{mes}
      </span>
      <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} strokeWidth={2} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-navy">{evento.titulo}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{evento.detalhe}</span>
      </span>
    </div>
  )
}

function LinhaProjecao({ p }: { p: ProjecaoMateria }) {
  const coberto = p.totalQuestoes ? Math.round((p.respondidas / p.totalQuestoes) * 100) : 0
  return (
    <div className="border-t border-slate-100 py-3 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium text-slate-700">{p.materiaNome}</span>
        <span className="shrink-0 text-xs text-slate-400">
          {p.respondidas}/{p.totalQuestoes} vistas ({coberto}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-blue" style={{ width: `${coberto}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {p.restantes === 0 ? (
          <>Você já passou por todas as questões desta matéria.</>
        ) : p.diasParaCobrir !== null ? (
          <>
            Faltam <strong className="text-navy">{p.restantes}</strong>. No ritmo dos últimos {JANELA_DIAS} dias, isso dá
            cerca de <strong className="text-navy">{p.diasParaCobrir} dias</strong>.
          </>
        ) : (
          <>
            Faltam <strong className="text-navy">{p.restantes}</strong>. Ainda não dá para projetar um prazo — o ritmo
            das últimas {JANELA_DIAS} dias foi baixo demais para arriscar uma data.
          </>
        )}
      </p>
    </div>
  )
}

export default function Desempenho() {
  const { user } = useAuth()
  // Sem os blocos das aulas: esta tela conta acertos, nunca mostra o texto do
  // conteúdo — e os blocos são a parte pesada do tráfego.
  const { aulas, materias, questaoPorId, aulaPorId, materiaNomePorId, loading } = useTodasQuestoes()
  const [respostas, setRespostas] = useState<Resposta[] | null>(null)

  useEffect(() => {
    if (!user) return
    repo.listRespostas(user.id).then(setRespostas)
  }, [user])

  const porMateria = useMemo(
    () =>
      respostas
        ? agrupar(respostas, (r) => r.materiaId, (id) => materiaNomePorId.get(id) ?? 'Matéria removida')
        : [],
    [respostas, materiaNomePorId],
  )
  const porAula = useMemo(
    () => (respostas ? agrupar(respostas, (r) => r.aulaId, (id) => aulaPorId.get(id)?.titulo ?? 'Aula removida') : []),
    [respostas, aulaPorId],
  )
  const porAssunto = useMemo(
    () =>
      respostas ? agrupar(respostas, (r) => questaoPorId.get(r.questaoId)?.tema || '(sem assunto)', (t) => t) : [],
    [respostas, questaoPorId],
  )

  const extrato = useMemo(
    () => (respostas ? extratoDeAcompanhamento({ respostas, questaoPorId, materiaNomePorId }) : []),
    [respostas, questaoPorId, materiaNomePorId],
  )

  const projecao = useMemo(() => {
    if (!respostas) return []
    const totalPorMateria = new Map<string, number>()
    for (const m of materias) totalPorMateria.set(m.id, 0)
    for (const a of aulas) totalPorMateria.set(a.materiaId, (totalPorMateria.get(a.materiaId) ?? 0) + a.questoes.length)
    // Matéria sem questão nenhuma não tem o que projetar.
    for (const [id, n] of totalPorMateria) if (n === 0) totalPorMateria.delete(id)
    return projecaoPorMateria({ respostas, totalPorMateria, materiaNomePorId })
  }, [respostas, aulas, materias, materiaNomePorId])

  /**
   * "Por aula" e "por assunto" crescem com o acervo, não com a tela.
   *
   * Medido: com 288 aulas esta tela levava 1.977 ms para montar num celular,
   * contra 664 ms com 36 — porque desenhava uma barra por aula, sem teto. As
   * três primeiras seções cabem inteiras; estas duas entram por página.
   */
  const aulasVisiveis = useListaVisivel(porAula)
  const assuntosVisiveis = useListaVisivel(porAssunto)
  const projecaoVisivel = useListaVisivel(projecao)

  if (loading || respostas === null) return <p className="text-sm text-slate-400">Carregando…</p>

  if (respostas.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Você ainda não respondeu nenhuma questão"
        description="Suas estatísticas de acerto e erro aparecem aqui, junto com um extrato do que mudou de uma semana para a outra."
      />
    )
  }

  const totalAcertos = respostas.filter((r) => r.correta).length
  const pctGeral = Math.round((totalAcertos / respostas.length) * 100)

  return (
    <div className="space-y-6">
      <Card className="text-center">
        <p className="text-3xl font-bold text-navy">{pctGeral}%</p>
        <p className="text-sm text-slate-400">
          de aproveitamento geral · {totalAcertos}/{respostas.length} questões
        </p>
      </Card>

      <PainelCalibracao respostas={respostas} />

      {/* O extrato só aparece quando tem o que dizer. Uma caixa vazia com o
          título "o que mudou" seria pior que nenhuma caixa. */}
      {extrato.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-400">
            <CalendarRange className="h-4 w-4 text-brand-blue" strokeWidth={1.75} />
            Extrato de acompanhamento
          </h2>
          <Card>
            {extrato.map((e) => (
              <LinhaExtrato key={e.id} evento={e} />
            ))}
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
              Comparação entre os últimos {JANELA_DIAS} dias e os {JANELA_DIAS} anteriores. Matérias com poucas
              respostas ficam de fora até haver dado suficiente.
            </p>
          </Card>
        </section>
      )}

      {projecao.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Projeção por disciplina</h2>
          <Card>
            {projecaoVisivel.visiveis.map((p) => (
              <LinhaProjecao key={p.materiaId} p={p} />
            ))}
            <CarregarMais
              mostrando={projecaoVisivel.visiveis.length}
              total={projecaoVisivel.total}
              temMais={projecaoVisivel.temMais}
              onVerMais={projecaoVisivel.verMais}
            />
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Por matéria</h2>
        <Card>{porMateria.map((g) => <Barra key={g.nome} grupo={g} />)}</Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Por aula</h2>
        <Card>
          {aulasVisiveis.visiveis.map((g) => (
            <Barra key={g.nome} grupo={g} />
          ))}
          <CarregarMais
            mostrando={aulasVisiveis.visiveis.length}
            total={aulasVisiveis.total}
            temMais={aulasVisiveis.temMais}
            onVerMais={aulasVisiveis.verMais}
          />
        </Card>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Por assunto</h2>
        <Card>
          {assuntosVisiveis.visiveis.map((g) => (
            <Barra key={g.nome} grupo={g} />
          ))}
          <CarregarMais
            mostrando={assuntosVisiveis.visiveis.length}
            total={assuntosVisiveis.total}
            temMais={assuntosVisiveis.temMais}
            onVerMais={assuntosVisiveis.verMais}
          />
        </Card>
      </section>
    </div>
  )
}
