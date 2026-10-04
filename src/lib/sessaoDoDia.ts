import type { EstadoCartao } from './flashcards'
import type { EstadoRevisao } from './revisaoEspacada'

/**
 * A sessão do dia: o que fazer AGORA com o tempo que você tem.
 *
 * ===================== POR QUE ISTO EXISTE ================================
 *
 * O dia ruim é o que decide a aprovação. Quem estuda seis meses para um
 * concurso disputado não falha nos dias bons — falha na terça em que o
 * trabalho atrasou, a cabeça não está boa e a fila acumulada parece um muro.
 * Nesse dia a decisão real não é "estudar 3 horas ou 2": é ESTUDAR UM POUCO
 * OU NÃO ABRIR O APP. E não abrir é o que quebra a corrente, porque a
 * repetição espaçada só funciona se as sessões acontecerem.
 *
 * Então em vez de mostrar "você tem 83 questões vencidas" — que no dia ruim
 * é um convite a fechar o app —, esta tela pergunta quanto tempo você tem e
 * entrega uma fila que CABE nele, montada pelo que mais rende:
 *
 * - Prática de recuperação, e não releitura. Dunlosky e colegas (2013)
 *   classificam praticar teste e distribuir a prática como as duas técnicas
 *   de ALTA utilidade entre dez; reler e sublinhar ficam entre as de baixa.
 *   Dez minutos de recuperação valem mais que uma hora de releitura.
 *
 * - Especialmente no dia estressado. Smith, Floerke e Thomas (Science, 2016)
 *   induziram estresse em metade dos participantes 24h depois do estudo: quem
 *   aprendeu relendo teve a perda de memória típica do estresse; quem aprendeu
 *   RECUPERANDO ficou imune a ela. (Trabalhos posteriores apontam que o efeito
 *   depende da dificuldade do material — não é mágica —, mas a direção se
 *   mantém: memória treinada por recuperação resiste melhor ao dia ruim.)
 *   Ou seja: justamente no dia em que você está mal, a coisa certa a fazer é
 *   a fila, não o resumo.
 *
 * - O que está mais perto de ser esquecido primeiro, e o erro cometido com
 *   certeza antes de tudo (ver `vencidasPrimeiro`).
 *
 * Nada aqui é gravado: é uma leitura do ciclo e dos cartões que já existem.
 */

/** Minutos oferecidos. Começa em 5 de propósito: 5 minutos é melhor que zero. */
export const TEMPOS_OFERECIDOS = [5, 15, 30] as const
export type Minutos = (typeof TEMPOS_OFERECIDOS)[number]

/**
 * Quanto tempo custa cada item, em segundos.
 *
 * Números deliberadamente conservadores: é melhor a pessoa terminar a fila
 * com tempo sobrando (e sentir que cumpriu) do que estourar o tempo que ela
 * disse ter. Fila que não termina é fila abandonada.
 *
 * Questão de múltipla escolha com enunciado de concurso: ler, decidir, ler o
 * comentário. Cartão: só recuperar e julgar a nota.
 */
export const SEGUNDOS_POR_QUESTAO = 90
export const SEGUNDOS_POR_CARTAO = 25

export interface PlanoDoDia {
  /** Quantas questões vencidas cabem no tempo. */
  questoes: number
  /** Quantos cartões vencidos cabem no tempo. */
  cartoes: number
  /** Total disponível, para a tela poder dizer "de quantas". */
  questoesDisponiveis: number
  cartoesDisponiveis: number
  /** Minutos que o plano ocupa de verdade. */
  minutosEstimados: number
  /** Nada vencido hoje — a tela precisa dizer isso com alegria, não com vazio. */
  vazia: boolean
}

/**
 * Monta o plano para um orçamento de tempo.
 *
 * Os cartões vêm primeiro na divisão do tempo porque custam um terço de uma
 * questão: num orçamento de cinco minutos, gastar tudo em três questões
 * deixaria doze cartões vencidos para trás. Metade do tempo para cada tipo
 * quando os dois têm fila — o cartão treina a produção da resposta, a questão
 * treina o formato da prova, e os dois precisam acontecer.
 */
export function planoDoDia(
  minutos: number,
  questoesVencidas: number,
  cartoesVencidos: number,
): PlanoDoDia {
  const segundos = Math.max(0, minutos) * 60
  const temAmbos = questoesVencidas > 0 && cartoesVencidos > 0

  const paraCartoes = temAmbos ? segundos / 2 : cartoesVencidos > 0 ? segundos : 0
  let cartoes = Math.min(cartoesVencidos, Math.floor(paraCartoes / SEGUNDOS_POR_CARTAO))

  // O tempo que os cartões não usaram volta para as questões, em vez de
  // ficar parado: quem tem 2 cartões e 40 questões não pode receber um plano
  // com metade do tempo vazia.
  const sobra = segundos - cartoes * SEGUNDOS_POR_CARTAO
  let questoes = Math.min(questoesVencidas, Math.floor(sobra / SEGUNDOS_POR_QUESTAO))

  // E se nem uma questão couber, o resto vira cartão — melhor um cartão a
  // mais do que tempo sobrando sem nada para fazer.
  if (questoes === 0 && cartoes < cartoesVencidos) {
    cartoes = Math.min(cartoesVencidos, Math.floor(segundos / SEGUNDOS_POR_CARTAO))
  }
  // Orçamento pequeno com fila grande: pelo menos UMA coisa, sempre. Um plano
  // que devolve "nada cabe" ensina a pessoa a não perguntar mais.
  if (questoes === 0 && cartoes === 0) {
    if (cartoesVencidos > 0) cartoes = 1
    else if (questoesVencidas > 0) questoes = 1
  }

  return {
    questoes,
    cartoes,
    questoesDisponiveis: questoesVencidas,
    cartoesDisponiveis: cartoesVencidos,
    minutosEstimados: Math.round(((questoes * SEGUNDOS_POR_QUESTAO + cartoes * SEGUNDOS_POR_CARTAO) / 60) * 10) / 10,
    vazia: questoesVencidas === 0 && cartoesVencidos === 0,
  }
}

/** Quantas questões do ciclo já passaram da hora. */
export function questoesVencidas(estados: Map<string, EstadoRevisao>): number {
  let n = 0
  for (const e of estados.values()) if (e.vencida) n += 1
  return n
}

/** Quantos cartões já passaram da hora (os novos não contam: são opcionais do dia). */
export function cartoesVencidos(estados: Map<string, EstadoCartao>, hoje = new Date()): number {
  const dia = hoje.toISOString().slice(0, 10)
  let n = 0
  for (const e of estados.values()) if (e.proximaEm <= dia) n += 1
  return n
}
