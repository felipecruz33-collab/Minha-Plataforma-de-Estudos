import type { Questao, Resposta } from './types'

/**
 * Flashcards a partir do que a pessoa erra sempre.
 *
 * ================= POR QUE ISTO NÃO É "REFAZER A QUESTÃO" =================
 *
 * A pergunta óbvia é: se a questão errada já volta na aba de Questões
 * erradas, para que um cartão com a mesma questão?
 *
 * Porque o MODO de lembrar é diferente, e a diferença é medida. A
 * meta-análise de Rowland (2014, 61 estudos) separa os formatos: reconhecer a
 * resposta no meio de alternativas rende g ≈ 0,29; ter que produzir a
 * resposta a partir de uma deixa rende bem mais — e com exposição repetida a
 * distância chega a g ≈ 0,72 contra os mesmos 0,29 do reconhecimento.
 * Múltipla escolha é reconhecimento. O cartão esconde as alternativas e
 * obriga a produzir — é o mesmo conteúdo cobrado de um jeito mais difícil, e
 * é dessa dificuldade que vem o ganho.
 *
 * Por isso o cartão é a questão SEM as alternativas, e não um resumo novo
 * gerado por IA: o material já está curado, não custa cota nenhuma, e o
 * gabarito comentado que o professor escreveu é uma resposta melhor do que
 * qualquer uma que uma IA inventaria.
 *
 * ===================== COMO O ASSUNTO VIRA BARALHO ========================
 *
 * Só entra assunto que a pessoa erra DE VERDADE e MAIS DE UMA VEZ. O gatilho
 * é três erros no mesmo `tema`. Sem esse corte, a primeira semana de estudo
 * produziria duzentos cartões e a pessoa abandonaria a aba na terça — que é
 * exatamente o fracasso que se quer evitar.
 *
 * Rowland também encontra que a prática de recuperação rende mais quando a
 * pessoa já acerta parte das vezes (acima de ~75% de sucesso na recuperação);
 * cartão que a pessoa erra sempre vira frustração, não aprendizado. O corte
 * por repetição e o teto de cartões novos por dia existem para manter a fila
 * nesse território.
 */

// ---------------------------------------------------------------------------
// 1. Quais assuntos viram baralho
// ---------------------------------------------------------------------------

/**
 * Erros no mesmo assunto para ele virar baralho.
 *
 * Três, e não um: um erro é acidente (desatenção, chute, pressa). Três no
 * mesmo assunto é padrão — e padrão é o que vale a pena atacar com repetição
 * espaçada.
 */
export const ERROS_PARA_VIRAR_BARALHO = 3

export interface AssuntoFraco {
  tema: string
  /** Erros cometidos neste assunto (eventos, não questões distintas). */
  erros: number
  tentativas: number
  /** Aproveitamento em %, para ordenar o que está pior. */
  pct: number
  /** Questões deste assunto que a pessoa já errou alguma vez. */
  questaoIds: string[]
}

/**
 * Os assuntos que a pessoa erra constantemente, do pior para o melhor.
 *
 * Sai do histórico de respostas, que já existe — nada aqui é gravado, e
 * mudar a régua amanhã não deixa nenhum dado velho errado.
 */
export function assuntosFracos(respostas: Resposta[], questaoPorId: Map<string, Questao>): AssuntoFraco[] {
  const porTema = new Map<string, { erros: number; tentativas: number; erradas: Set<string> }>()

  for (const r of respostas) {
    const questao = questaoPorId.get(r.questaoId)
    // Questão apagada, ou tema em branco: não dá para agrupar por assunto o
    // que não tem assunto.
    const tema = questao?.tema?.trim()
    if (!tema) continue

    const atual = porTema.get(tema) ?? { erros: 0, tentativas: 0, erradas: new Set<string>() }
    atual.tentativas += 1
    if (!r.correta) {
      atual.erros += 1
      atual.erradas.add(r.questaoId)
    }
    porTema.set(tema, atual)
  }

  return Array.from(porTema.entries())
    .filter(([, v]) => v.erros >= ERROS_PARA_VIRAR_BARALHO && v.erradas.size > 0)
    .map(([tema, v]) => ({
      tema,
      erros: v.erros,
      tentativas: v.tentativas,
      pct: v.tentativas ? Math.round(((v.tentativas - v.erros) / v.tentativas) * 100) : 0,
      questaoIds: Array.from(v.erradas),
    }))
    // O pior aproveitamento primeiro; empatou, quem errou mais vezes.
    .sort((a, b) => a.pct - b.pct || b.erros - a.erros)
}

// ---------------------------------------------------------------------------
// 2. O agendamento (SM-2)
// ---------------------------------------------------------------------------

/**
 * SM-2, o algoritmo do SuperMemo que o Anki usa há vinte anos.
 *
 * Por que ele e não o FSRS, que é melhor: o FSRS ganha de 15 a 30% em número
 * de revisões para a mesma retenção, mas ele AJUSTA PARÂMETROS ao histórico
 * de cada pessoa e precisa de cerca de mil revisões para isso. Quem está
 * começando não tem mil revisões, e um modelo sem dados é só um palpite com
 * matemática em volta. SM-2 funciona bem desde o primeiro cartão, cabe em
 * cinquenta linhas sem dependência nenhuma, e é auditável — dá para olhar o
 * número e entender por que o cartão voltou hoje.
 */

export type Nota = 'errei' | 'dificil' | 'bom' | 'facil'

/** A nota de 0 a 5 do SM-2 original. */
const QUALIDADE: Record<Nota, number> = { errei: 0, dificil: 3, bom: 4, facil: 5 }

/** Piso da facilidade, do SM-2 original: abaixo disto o cartão volta sem parar. */
export const FACILIDADE_MINIMA = 1.3
/** Facilidade de um cartão novo, também do original. */
export const FACILIDADE_INICIAL = 2.5

export interface EstadoCartao {
  questaoId: string
  /** "Ease factor": quanto o intervalo cresce a cada acerto. */
  facilidade: number
  intervaloDias: number
  /** Acertos seguidos desde o último tropeço. */
  repeticoes: number
  /** Quantas vezes a pessoa errou este cartão depois de já tê-lo acertado. */
  lapsos: number
  /** Dia (YYYY-MM-DD) em que ele volta. */
  proximaEm: string
  ultimaEm: string
}

const DIA_MS = 24 * 60 * 60 * 1000
const dia = (d: Date) => d.toISOString().slice(0, 10)
const somarDias = (base: string, dias: number) =>
  new Date(new Date(`${base}T00:00:00Z`).getTime() + dias * DIA_MS).toISOString().slice(0, 10)

/**
 * O próximo estado do cartão depois de uma nota.
 *
 * Fiel ao SM-2: a facilidade sobe com nota alta e desce com nota baixa; os
 * dois primeiros intervalos são fixos (1 e 6 dias) e a partir do terceiro o
 * intervalo é o anterior vezes a facilidade. Errar zera as repetições e traz
 * o cartão para o dia seguinte, mas NÃO zera a facilidade — o que a pessoa já
 * mostrou saber sobre aquele cartão não é apagado por um tropeço.
 */
export function proximoEstado(atual: EstadoCartao | null, questaoId: string, nota: Nota, hoje = new Date()): EstadoCartao {
  const q = QUALIDADE[nota]
  const base: EstadoCartao = atual ?? {
    questaoId,
    facilidade: FACILIDADE_INICIAL,
    intervaloDias: 0,
    repeticoes: 0,
    lapsos: 0,
    proximaEm: dia(hoje),
    ultimaEm: dia(hoje),
  }

  // Fórmula do SM-2 para a facilidade, aplicada em qualquer nota.
  const facilidade = Math.max(
    FACILIDADE_MINIMA,
    base.facilidade + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  )

  if (q < 3) {
    return {
      ...base,
      facilidade,
      intervaloDias: 1,
      repeticoes: 0,
      lapsos: base.lapsos + (base.repeticoes > 0 ? 1 : 0),
      proximaEm: somarDias(dia(hoje), 1),
      ultimaEm: dia(hoje),
    }
  }

  const repeticoes = base.repeticoes + 1
  const intervaloDias =
    repeticoes === 1 ? 1 : repeticoes === 2 ? 6 : Math.round(base.intervaloDias * facilidade)

  return {
    ...base,
    facilidade,
    intervaloDias,
    repeticoes,
    proximaEm: somarDias(dia(hoje), intervaloDias),
    ultimaEm: dia(hoje),
  }
}

// ---------------------------------------------------------------------------
// 3. A fila do dia
// ---------------------------------------------------------------------------

/**
 * Teto de cartões NOVOS por dia.
 *
 * O limite existe porque o custo de um cartão novo não é hoje — é o rastro de
 * revisões que ele gera pelos próximos meses. Vinte cartões novos por dia
 * viram, em algumas semanas, uma fila diária que ninguém cumpre; e fila que
 * não se cumpre é abandonada inteira. Oito é um número que uma pessoa com
 * emprego consegue sustentar num dia ruim, que é o dia que decide se o hábito
 * sobrevive.
 */
export const NOVOS_POR_DIA_PADRAO = 8

/** Teto de revisões por dia, para um acúmulo não virar um muro. */
export const REVISOES_POR_DIA_PADRAO = 60

export interface FilaDeHoje {
  /** Cartões já vistos que venceram o prazo. */
  revisar: string[]
  /** Cartões que a pessoa ainda não viu, já cortados pelo teto do dia. */
  novos: string[]
  /** Quantos venceram no total, antes do teto — para a tela dizer a verdade. */
  totalVencidos: number
  /** Quantos candidatos a novo existem ao todo. */
  totalNovos: number
}

export function montarFila(
  assuntos: AssuntoFraco[],
  estados: Map<string, EstadoCartao>,
  hoje = new Date(),
  limites: { novosPorDia?: number; revisoesPorDia?: number } = {},
): FilaDeHoje {
  const novosPorDia = limites.novosPorDia ?? NOVOS_POR_DIA_PADRAO
  const revisoesPorDia = limites.revisoesPorDia ?? REVISOES_POR_DIA_PADRAO
  const diaHoje = dia(hoje)

  const candidatos: string[] = []
  for (const assunto of assuntos) for (const id of assunto.questaoIds) candidatos.push(id)

  const vencidos: EstadoCartao[] = []
  const novos: string[] = []
  for (const id of candidatos) {
    const estado = estados.get(id)
    if (!estado) novos.push(id)
    else if (estado.proximaEm <= diaHoje) vencidos.push(estado)
  }

  // O mais atrasado primeiro: é o que está mais perto de ser esquecido.
  vencidos.sort((a, b) => a.proximaEm.localeCompare(b.proximaEm))

  return {
    revisar: vencidos.slice(0, revisoesPorDia).map((e) => e.questaoId),
    novos: novos.slice(0, Math.max(0, novosPorDia)),
    totalVencidos: vencidos.length,
    totalNovos: novos.length,
  }
}

/** Texto curto do prazo, para a tela. */
export function textoDoIntervalo(dias: number): string {
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  if (dias < 30) return `em ${dias} dias`
  const meses = Math.round(dias / 30)
  return meses === 1 ? 'em 1 mês' : `em ${meses} meses`
}

/**
 * Ids das questões que estão em algum baralho.
 *
 * Serve para a aba de Questões erradas saber quais prazos esticar: assunto
 * que já é treinado em flashcard não precisa da questão voltando com a mesma
 * pressa — ver `ESCADA_DIAS_COM_FLASHCARD` em `revisaoEspacada.ts`.
 */
export function questoesEmFlashcard(assuntos: AssuntoFraco[]): Set<string> {
  const ids = new Set<string>()
  for (const a of assuntos) for (const id of a.questaoIds) ids.add(id)
  return ids
}
