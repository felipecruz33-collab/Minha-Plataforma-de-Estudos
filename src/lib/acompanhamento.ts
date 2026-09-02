import { estadosDeRevisao, type EstadoRevisao } from './revisaoEspacada'
import type { Questao, Resposta } from './types'

/**
 * Extrato de acompanhamento e projeção por disciplina.
 *
 * A tela de Desempenho já dizia QUANTO você acerta. O que faltava era o que
 * MUDOU: um número parado não avisa que Constitucional caiu sete pontos nas
 * últimas duas semanas, nem que Administrativo passou na frente. Quem estuda
 * meses a fio não percebe isso sozinho — é exatamente o serviço que um mentor
 * presta.
 *
 * Tudo aqui sai de `respostas`, que já guarda data e acerto/erro de cada
 * resposta. Nada é gravado: o extrato é recalculado a cada visita, e mudar uma
 * régua não invalida nenhum dado antigo.
 *
 * Duas regras que valem pra tudo neste arquivo:
 *
 * 1. NÃO inventar precisão. Toda comparação exige um mínimo de respostas dos
 *    dois lados; abaixo disso o evento simplesmente não aparece. Dizer "caiu
 *    12 pontos" com base em duas questões seria mentira com cara de dado.
 * 2. NÃO ser só más notícias. Um extrato que só cobra vira um extrato que
 *    ninguém abre — o que subiu e o que foi dominado entram junto.
 */

const DIA_MS = 24 * 60 * 60 * 1000

/** Tamanho de cada janela de comparação, em dias. Duas semanas pega o ritmo sem virar ruído. */
export const JANELA_DIAS = 14

/** Respostas mínimas em CADA janela pra uma matéria entrar na comparação. */
export const MIN_RESPOSTAS_COMPARACAO = 8

/** Diferença mínima, em pontos percentuais, pra virar notícia. */
export const VARIACAO_MINIMA = 8

export type TomEvento = 'bom' | 'ruim' | 'neutro'

export interface EventoExtrato {
  id: string
  /** Data do evento (YYYY-MM-DD). */
  em: string
  titulo: string
  detalhe: string
  tom: TomEvento
}

export interface EntradaAcompanhamento {
  respostas: Resposta[]
  questaoPorId: Map<string, Questao>
  materiaNomePorId: Map<string, string>
  hoje?: Date
}

function diaISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pct(acertos: number, total: number): number {
  return total ? Math.round((acertos / total) * 100) : 0
}

interface Placar {
  total: number
  acertos: number
}

function placarPorMateria(respostas: Resposta[]): Map<string, Placar> {
  const mapa = new Map<string, Placar>()
  for (const r of respostas) {
    const atual = mapa.get(r.materiaId) ?? { total: 0, acertos: 0 }
    atual.total += 1
    if (r.correta) atual.acertos += 1
    mapa.set(r.materiaId, atual)
  }
  return mapa
}

/**
 * O extrato: o que mudou, em ordem, da novidade mais recente para a mais
 * antiga.
 *
 * Cada detector é independente e devolve zero ou mais eventos. Nenhum deles
 * roda sobre dado insuficiente — a alternativa seria uma tela cheia de
 * afirmações que a própria pessoa sabe que não fazem sentido, e aí ela para de
 * confiar no resto da tela junto.
 */
export function extratoDeAcompanhamento({
  respostas,
  questaoPorId,
  materiaNomePorId,
  hoje = new Date(),
}: EntradaAcompanhamento): EventoExtrato[] {
  if (respostas.length === 0) return []

  const agora = hoje.getTime()
  const corteRecente = new Date(agora - JANELA_DIAS * DIA_MS).toISOString()
  const corteAnterior = new Date(agora - 2 * JANELA_DIAS * DIA_MS).toISOString()
  const hojeISO = diaISO(hoje)

  const recentes = respostas.filter((r) => r.respondidoEm >= corteRecente)
  const anteriores = respostas.filter((r) => r.respondidoEm >= corteAnterior && r.respondidoEm < corteRecente)

  const eventos: EventoExtrato[] = []
  const nomeDe = (id: string) => materiaNomePorId.get(id) ?? 'Matéria removida'

  const agoraPorMateria = placarPorMateria(recentes)
  const antesPorMateria = placarPorMateria(anteriores)

  /** Matérias com volume suficiente nas DUAS janelas — as únicas comparáveis. */
  const comparaveis = Array.from(agoraPorMateria.entries())
    .map(([materiaId, agora2]) => ({ materiaId, agora: agora2, antes: antesPorMateria.get(materiaId) }))
    .filter(
      (m): m is { materiaId: string; agora: Placar; antes: Placar } =>
        !!m.antes && m.agora.total >= MIN_RESPOSTAS_COMPARACAO && m.antes.total >= MIN_RESPOSTAS_COMPARACAO,
    )
    .map((m) => ({ ...m, pctAgora: pct(m.agora.acertos, m.agora.total), pctAntes: pct(m.antes.acertos, m.antes.total) }))

  // --- Subiu ou caiu ---------------------------------------------------------
  for (const m of comparaveis) {
    const delta = m.pctAgora - m.pctAntes
    if (Math.abs(delta) < VARIACAO_MINIMA) continue
    const subiu = delta > 0
    eventos.push({
      id: `variacao:${m.materiaId}`,
      em: hojeISO,
      titulo: `Seu aproveitamento em ${nomeDe(m.materiaId)} ${subiu ? 'subiu' : 'caiu'} para ${m.pctAgora}%.`,
      detalhe: `Eram ${m.pctAntes}% nas ${JANELA_DIAS} dias anteriores — ${subiu ? 'ganho' : 'queda'} de ${Math.abs(delta)} pontos.`,
      tom: subiu ? 'bom' : 'ruim',
    })
  }

  // --- Uma matéria passou na frente da outra ---------------------------------
  //
  // Só o par mais relevante. Com cinco matérias comparáveis, todas as
  // ultrapassagens possíveis encheriam o extrato de linhas que dizem a mesma
  // coisa por ângulos diferentes.
  let melhorTroca: { a: (typeof comparaveis)[number]; b: (typeof comparaveis)[number]; margem: number } | null = null
  for (const a of comparaveis) {
    for (const b of comparaveis) {
      if (a.materiaId === b.materiaId) continue
      if (!(a.pctAntes < b.pctAntes && a.pctAgora > b.pctAgora)) continue
      const margem = a.pctAgora - b.pctAgora + (b.pctAntes - a.pctAntes)
      if (!melhorTroca || margem > melhorTroca.margem) melhorTroca = { a, b, margem }
    }
  }
  if (melhorTroca) {
    eventos.push({
      id: `ultrapassagem:${melhorTroca.a.materiaId}`,
      em: hojeISO,
      titulo: `${nomeDe(melhorTroca.a.materiaId)} passou na frente de ${nomeDe(melhorTroca.b.materiaId)}.`,
      detalhe: `${melhorTroca.a.pctAgora}% contra ${melhorTroca.b.pctAgora}% — há ${JANELA_DIAS} dias era o contrário.`,
      tom: 'neutro',
    })
  }

  // --- Voltaram para o Caderno de Revisão ------------------------------------
  const estados = estadosDeRevisao(respostas, hoje)
  const venceuRecente = diaISO(new Date(agora - 7 * DIA_MS))
  const temasQueVoltaram = new Set<string>()
  for (const e of estados.values()) {
    if (!e.vencida || e.voltaEm < venceuRecente) continue
    const tema = questaoPorId.get(e.questaoId)?.tema
    if (tema) temasQueVoltaram.add(tema)
  }
  if (temasQueVoltaram.size > 0) {
    const n = temasQueVoltaram.size
    eventos.push({
      id: 'revisao:venceram',
      em: hojeISO,
      titulo: `${n} ${n === 1 ? 'tópico voltou' : 'tópicos voltaram'} para o Caderno de Revisão.`,
      detalhe:
        n === 1
          ? `O prazo de revisão de "${Array.from(temasQueVoltaram)[0]}" venceu.`
          : `Entre eles: ${Array.from(temasQueVoltaram).slice(0, 3).join(', ')}.`,
      tom: 'ruim',
    })
  }

  // --- Mesmo assunto errado duas vezes seguidas ------------------------------
  const porTema = new Map<string, Resposta[]>()
  for (const r of recentes) {
    const tema = questaoPorId.get(r.questaoId)?.tema
    if (!tema) continue
    const lista = porTema.get(tema)
    if (lista) lista.push(r)
    else porTema.set(tema, [r])
  }
  for (const [tema, lista] of porTema) {
    const emOrdem = [...lista].sort((a, b) => a.respondidoEm.localeCompare(b.respondidoEm))
    let seguidos = 0
    let pior = 0
    let quando = ''
    for (const r of emOrdem) {
      seguidos = r.correta ? 0 : seguidos + 1
      if (seguidos > pior) {
        pior = seguidos
        quando = diaISO(new Date(r.respondidoEm))
      }
    }
    if (pior >= 2) {
      eventos.push({
        id: `seguidos:${tema}`,
        em: quando,
        titulo: `Você errou "${tema}" ${pior} vezes seguidas.`,
        detalhe: 'O assunto está no Caderno de Revisão com a teoria da aula de onde ele veio.',
        tom: 'ruim',
      })
    }
  }

  // --- Chegou ao último degrau (a boa notícia) -------------------------------
  const dominadasRecentes = Array.from(estados.values()).filter(
    (e: EstadoRevisao) => e.dominada && e.ultimaEm >= diaISO(new Date(agora - JANELA_DIAS * DIA_MS)),
  )
  if (dominadasRecentes.length > 0) {
    const n = dominadasRecentes.length
    eventos.push({
      id: 'revisao:dominadas',
      em: hojeISO,
      titulo: `${n} ${n === 1 ? 'questão chegou' : 'questões chegaram'} ao último degrau da revisão.`,
      detalhe: 'Você errou e depois acertou quatro vezes seguidas — agora elas só voltam daqui a 60 dias.',
      tom: 'bom',
    })
  }

  // --- Ritmo -----------------------------------------------------------------
  if (recentes.length > 0 && anteriores.length > 0) {
    const delta = recentes.length - anteriores.length
    if (Math.abs(delta) >= Math.max(10, anteriores.length * 0.25)) {
      eventos.push({
        id: 'ritmo',
        em: hojeISO,
        titulo: `Você respondeu ${recentes.length} questões nos últimos ${JANELA_DIAS} dias.`,
        detalhe:
          delta > 0
            ? `São ${delta} a mais que nos ${JANELA_DIAS} dias anteriores.`
            : `São ${Math.abs(delta)} a menos que nos ${JANELA_DIAS} dias anteriores.`,
        tom: delta > 0 ? 'bom' : 'ruim',
      })
    }
  }

  return eventos.sort((a, b) => b.em.localeCompare(a.em) || a.titulo.localeCompare(b.titulo))
}

export interface ProjecaoMateria {
  materiaId: string
  materiaNome: string
  /** Questões distintas já respondidas alguma vez. */
  respondidas: number
  /** Questões que existem na matéria. */
  totalQuestoes: number
  restantes: number
  pct: number
  /** Questões NOVAS por dia no ritmo recente. `null` quando não dá pra afirmar. */
  porDia: number | null
  /** Dias para cobrir o que falta nesse ritmo. `null` quando não dá pra afirmar. */
  diasParaCobrir: number | null
}

export interface EntradaProjecao {
  respostas: Resposta[]
  /** Quantas questões existem em cada matéria. */
  totalPorMateria: Map<string, number>
  materiaNomePorId: Map<string, string>
  hoje?: Date
}

/**
 * Quanto falta de cada matéria e, no ritmo das últimas duas semanas, em quanto
 * tempo isso acaba.
 *
 * O ritmo conta questões NOVAS (primeira vez que você responde aquela questão),
 * não respostas: refazer as mesmas dez questões todo dia não cobre a matéria, e
 * uma projeção que fingisse o contrário prometeria uma data que nunca chega.
 *
 * `porDia` e `diasParaCobrir` vêm `null` quando o ritmo recente é fraco demais
 * pra sustentar uma previsão. Nesses casos a tela mostra o que falta e cala
 * sobre o prazo, que é a resposta honesta.
 */
export function projecaoPorMateria({
  respostas,
  totalPorMateria,
  materiaNomePorId,
  hoje = new Date(),
}: EntradaProjecao): ProjecaoMateria[] {
  const corteRecente = new Date(hoje.getTime() - JANELA_DIAS * DIA_MS).toISOString()

  const respondidasPorMateria = new Map<string, Set<string>>()
  const primeiraVez = new Map<string, string>()
  const placar = new Map<string, Placar>()

  for (const r of [...respostas].sort((a, b) => a.respondidoEm.localeCompare(b.respondidoEm))) {
    if (!primeiraVez.has(r.questaoId)) primeiraVez.set(r.questaoId, r.respondidoEm)
    const vistas = respondidasPorMateria.get(r.materiaId) ?? new Set<string>()
    vistas.add(r.questaoId)
    respondidasPorMateria.set(r.materiaId, vistas)
    const p = placar.get(r.materiaId) ?? { total: 0, acertos: 0 }
    p.total += 1
    if (r.correta) p.acertos += 1
    placar.set(r.materiaId, p)
  }

  // Questões estreadas na janela recente, por matéria.
  const novasNaJanela = new Map<string, number>()
  for (const r of respostas) {
    if (primeiraVez.get(r.questaoId) !== r.respondidoEm) continue
    if (r.respondidoEm < corteRecente) continue
    novasNaJanela.set(r.materiaId, (novasNaJanela.get(r.materiaId) ?? 0) + 1)
  }

  return Array.from(totalPorMateria.entries())
    .map(([materiaId, totalQuestoes]) => {
      const respondidas = respondidasPorMateria.get(materiaId)?.size ?? 0
      const restantes = Math.max(0, totalQuestoes - respondidas)
      const novas = novasNaJanela.get(materiaId) ?? 0
      // Menos de uma questão nova a cada dois dias não sustenta previsão: o
      // número sairia gigante e a data, ficção.
      const ritmoSuficiente = novas >= JANELA_DIAS / 2
      const porDia = ritmoSuficiente ? novas / JANELA_DIAS : null
      const p = placar.get(materiaId)
      return {
        materiaId,
        materiaNome: materiaNomePorId.get(materiaId) ?? 'Matéria removida',
        respondidas,
        totalQuestoes,
        restantes,
        pct: p ? pct(p.acertos, p.total) : 0,
        porDia,
        diasParaCobrir: porDia && restantes > 0 ? Math.ceil(restantes / porDia) : null,
      }
    })
    .sort((a, b) => b.restantes - a.restantes || a.materiaNome.localeCompare(b.materiaNome))
}
