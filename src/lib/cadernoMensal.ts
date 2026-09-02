import { estadosDeRevisao } from './revisaoEspacada'
import type { Questao, Resposta } from './types'

/**
 * Caderno de questões do mês, montado pelo seu nível.
 *
 * O app não sabe se uma questão é "difícil" — nenhuma banca manda esse dado, e
 * inventar uma nota de dificuldade seria chute com cara de número. O que ele
 * sabe é como VOCÊ vai: o que já acertou, o que errou e ainda não recuperou, e
 * o que nunca viu. O nível, então, é o do aluno, e o que muda de um nível para
 * o outro é a MISTURA do caderno.
 *
 * Iniciante precisa criar ritmo, e um caderno só de fraqueza desanima antes de
 * ensinar. Avançado já tem ritmo e precisa é de atrito. É a mesma ideia do
 * treino: quem começa não levanta o peso de quem treina há dois anos.
 *
 * Nada aqui é gravado. O caderno é remontado a cada visita a partir das suas
 * respostas — por isso ele acompanha os seus resultados sozinho.
 */

export type Nivel = 'iniciante' | 'intermediario' | 'avancado'

export const ROTULO_NIVEL: Record<Nivel, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
}

/** Quantas questões o caderno do mês tenta reunir. */
export const TAMANHO_CADERNO = 40

/** Abaixo disso não há histórico suficiente pra cravar um nível. */
export const MIN_RESPOSTAS_NIVEL = 20

/** Janela usada pra medir o nível — o nível é o de agora, não o de sempre. */
export const JANELA_NIVEL_DIAS = 30

const DIA_MS = 24 * 60 * 60 * 1000

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export interface NivelDoAluno {
  nivel: Nivel
  /** Aproveitamento que produziu o nível. */
  pct: number
  /** Quantas respostas entraram na conta. */
  consideradas: number
  /**
   * De onde saiu o nível: dos últimos 30 dias, do histórico inteiro (quando o
   * mês recente foi fraco de volume), ou de lugar nenhum ainda.
   */
  base: 'recente' | 'geral' | 'inicio'
}

/**
 * O nível é medido pelos últimos 30 dias.
 *
 * Usar o histórico inteiro travaria o nível: quem começou mal há seis meses
 * carregaria aquele começo pra sempre, e o caderno nunca acompanharia a
 * evolução — que é exatamente o que se pediu dele. O histórico geral entra só
 * como reserva, quando o mês recente não tem volume pra afirmar nada.
 */
export function nivelDoAluno(respostas: Resposta[], hoje = new Date()): NivelDoAluno {
  const corte = new Date(hoje.getTime() - JANELA_NIVEL_DIAS * DIA_MS).toISOString()
  const recentes = respostas.filter((r) => r.respondidoEm >= corte)

  const escolhidas = recentes.length >= MIN_RESPOSTAS_NIVEL ? recentes : respostas
  const base: NivelDoAluno['base'] =
    recentes.length >= MIN_RESPOSTAS_NIVEL ? 'recente' : respostas.length >= MIN_RESPOSTAS_NIVEL ? 'geral' : 'inicio'

  if (base === 'inicio') {
    // Quem está começando entra como iniciante — não porque é ruim, mas porque
    // ninguém tem como saber ainda, e errar pra baixo aqui custa menos.
    const pct = escolhidas.length ? Math.round((escolhidas.filter((r) => r.correta).length / escolhidas.length) * 100) : 0
    return { nivel: 'iniciante', pct, consideradas: escolhidas.length, base }
  }

  const pct = Math.round((escolhidas.filter((r) => r.correta).length / escolhidas.length) * 100)
  const nivel: Nivel = pct >= 75 ? 'avancado' : pct >= 50 ? 'intermediario' : 'iniciante'
  return { nivel, pct, consideradas: escolhidas.length, base }
}

/**
 * A mistura de cada nível, em partes do caderno.
 *
 * `revisao` = você errou e ainda não recuperou. `reforco` = você acertou por
 * último (serve de chão). `ineditas` = nunca respondeu.
 */
export const MISTURA: Record<Nivel, { revisao: number; reforco: number; ineditas: number }> = {
  // Começando: pouco atrito, muito terreno novo, e um chão pra não desanimar.
  iniciante: { revisao: 0.2, reforco: 0.3, ineditas: 0.5 },
  intermediario: { revisao: 0.4, reforco: 0.15, ineditas: 0.45 },
  // Já tem ritmo: o caderno vira quase todo o que ainda escapa.
  avancado: { revisao: 0.6, reforco: 0.05, ineditas: 0.35 },
}

/** PRNG pequeno e determinístico — o caderno do mês precisa ser o MESMO o mês inteiro. */
function geradorDeSorte(semente: string): () => number {
  let h = 2166136261
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function embaralharCom<T>(itens: T[], sorte: () => number): T[] {
  const copia = [...itens]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(sorte() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

export interface CadernoMensal {
  /** '2026-09' */
  mesISO: string
  /** 'Caderno de setembro' */
  rotulo: string
  nivel: NivelDoAluno
  questoes: Questao[]
  /** Quantas questões vieram de cada origem, já com o que sobrou redistribuído. */
  composicao: { revisao: number; reforco: number; ineditas: number }
  /** Quantas questões existiam disponíveis ao todo. */
  disponiveis: number
}

export interface EntradaCaderno {
  questoes: Questao[]
  respostas: Resposta[]
  hoje?: Date
  tamanho?: number
}

/**
 * Monta o caderno do mês.
 *
 * Determinístico dentro do mês: o sorteio é semeado com o ano-mês, então abrir
 * o caderno de novo devolve o mesmo caderno. Um "caderno mensal" que sorteia
 * questões diferentes a cada visita não é um caderno, é um simulado aleatório
 * com outro nome — e ninguém consegue terminar o que muda embaixo do pé.
 *
 * Quando um dos três grupos não tem questão suficiente, a sobra vai para os
 * outros em vez de encolher o caderno: é melhor entregar 40 questões com a
 * mistura torta do que 22 com a mistura perfeita.
 *
 * Devolve `null` quando não há questão nenhuma pra montar.
 */
export function montarCadernoMensal({ questoes, respostas, hoje = new Date(), tamanho = TAMANHO_CADERNO }: EntradaCaderno): CadernoMensal | null {
  if (questoes.length === 0) return null

  const nivel = nivelDoAluno(respostas, hoje)
  const mesISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
  const sorte = geradorDeSorte(mesISO)

  const estados = estadosDeRevisao(respostas, hoje)
  const respondidas = new Set(respostas.map((r) => r.questaoId))

  const paraRevisao: Questao[] = []
  const paraReforco: Questao[] = []
  const ineditas: Questao[] = []
  for (const q of questoes) {
    if (estados.has(q.id)) paraRevisao.push(q)
    else if (respondidas.has(q.id)) paraReforco.push(q)
    else ineditas.push(q)
  }

  // Dentro da revisão, o que já venceu o prazo vem primeiro — é a dívida mais
  // antiga, e é ela que o caderno deveria cobrar.
  const revisaoOrdenada = embaralharCom(paraRevisao, sorte).sort((a, b) => {
    const ea = estados.get(a.id)!
    const eb = estados.get(b.id)!
    return ea.diasAteVoltar - eb.diasAteVoltar
  })

  const mistura = MISTURA[nivel.nivel]
  const alvo = Math.min(tamanho, questoes.length)

  const grupos = [
    { nome: 'revisao' as const, fila: revisaoOrdenada, cota: Math.round(alvo * mistura.revisao) },
    { nome: 'reforco' as const, fila: embaralharCom(paraReforco, sorte), cota: Math.round(alvo * mistura.reforco) },
    { nome: 'ineditas' as const, fila: embaralharCom(ineditas, sorte), cota: Math.round(alvo * mistura.ineditas) },
  ]

  const escolhidas: Questao[] = []
  const composicao = { revisao: 0, reforco: 0, ineditas: 0 }
  for (const g of grupos) {
    const pegas = g.fila.splice(0, g.cota)
    escolhidas.push(...pegas)
    composicao[g.nome] = pegas.length
  }

  // Sobrou espaço porque algum grupo estava vazio: completa com quem ainda
  // tem fila, na ordem inéditas -> revisão -> reforço.
  const ordemDeSobra = ['ineditas', 'revisao', 'reforco'] as const
  for (const nome of ordemDeSobra) {
    if (escolhidas.length >= alvo) break
    const g = grupos.find((x) => x.nome === nome)!
    const pegas = g.fila.splice(0, alvo - escolhidas.length)
    escolhidas.push(...pegas)
    composicao[nome] += pegas.length
  }

  return {
    mesISO,
    rotulo: `Caderno de ${MESES[hoje.getMonth()]}`,
    nivel,
    questoes: embaralharCom(escolhidas, sorte),
    composicao,
    disponiveis: questoes.length,
  }
}
