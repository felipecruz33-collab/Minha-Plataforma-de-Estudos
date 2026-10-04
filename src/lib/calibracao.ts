import type { Confianca, Resposta } from './types'

/**
 * Calibração: o quanto a sua sensação de saber bate com o que você acerta.
 *
 * É a estatística mais desconfortável e mais útil que este app pode mostrar.
 * Quem estuda para concurso de alta concorrência não perde a vaga por não
 * saber o que não sabe — perde por ACHAR QUE SABE o que não sabe. Essa é a
 * conta que o aproveitamento geral esconde: 70% de acerto pode ser 70% de
 * domínio ou 55% de domínio com 15% de sorte, e as duas coisas pedem semanas
 * de estudo completamente diferentes.
 *
 * Duas leituras saem daqui:
 *
 * 1. EXCESSO DE CONFIANÇA — quanto você acerta entre as que marcou "Tenho
 *    certeza". Abaixo de 90% já é um alerta: certeza que falha uma em dez é
 *    certeza que vai falhar na prova, onde o nervosismo trabalha contra.
 *
 * 2. QUANTO DO SEU ACERTO É SORTE — os acertos marcados como chute. Eles
 *    inflam o aproveitamento e, antes do modo confiança existir, também
 *    inflavam o prazo de revisão da questão.
 *
 * Nada aqui é gravado: é tudo leitura da coluna `confianca` de `respostas`.
 */

export interface FaixaCalibracao {
  grau: Confianca
  rotulo: string
  total: number
  acertos: number
  pct: number
}

export interface Calibracao {
  /** Respostas que têm confiança declarada (as outras não entram em nada). */
  comConfianca: number
  faixas: FaixaCalibracao[]
  /** Acerto declarado como chute: entrou na conta do aproveitamento, mas é sorte. */
  acertosChutados: number
  /** Erro cometido com certeza: a lacuna que mais rende corrigir. */
  errosComCerteza: number
  /**
   * Aproveitamento descontada a sorte, em %.
   *
   * O número que a prova vai cobrar: a mesma conta, sem contar como
   * conhecimento o que a pessoa mesma marcou como chute certo. `null` quando
   * não há respostas com confiança suficientes para dizer algo.
   */
  pctSemSorte: number | null
  /**
   * Diagnóstico pronto, só quando há dados para sustentá-lo.
   *
   * `null` em vez de um texto morno de propósito: diagnóstico com cinco
   * respostas não é diagnóstico, é ruído que faz a pessoa desconfiar do resto
   * da tela.
   */
  recado: { tom: 'alerta' | 'bom' | 'neutro'; texto: string } | null
}

const ROTULOS: Record<Confianca, string> = {
  chute: 'Chutei',
  duvida: 'Em dúvida',
  certeza: 'Tenho certeza',
}

/** Abaixo disto não há o que diagnosticar — só coincidência. */
export const MINIMO_PARA_DIAGNOSTICO = 20
/** Acerto esperado de quem diz ter certeza. Abaixo daqui é excesso de confiança. */
export const CERTEZA_ESPERADA = 90

export function calibracao(respostas: Resposta[]): Calibracao {
  const comConfianca = respostas.filter((r) => r.confianca)
  const faixas: FaixaCalibracao[] = (['certeza', 'duvida', 'chute'] as Confianca[]).map((grau) => {
    const doGrau = comConfianca.filter((r) => r.confianca === grau)
    const acertos = doGrau.filter((r) => r.correta).length
    return {
      grau,
      rotulo: ROTULOS[grau],
      total: doGrau.length,
      acertos,
      pct: doGrau.length ? Math.round((acertos / doGrau.length) * 100) : 0,
    }
  })

  const acertosChutados = comConfianca.filter((r) => r.correta && r.confianca === 'chute').length
  const errosComCerteza = comConfianca.filter((r) => !r.correta && r.confianca === 'certeza').length
  const acertos = comConfianca.filter((r) => r.correta).length

  const pctSemSorte = comConfianca.length
    ? Math.round(((acertos - acertosChutados) / comConfianca.length) * 100)
    : null

  const daCerteza = faixas.find((f) => f.grau === 'certeza')!
  let recado: Calibracao['recado'] = null
  if (comConfianca.length >= MINIMO_PARA_DIAGNOSTICO) {
    if (daCerteza.total >= 10 && daCerteza.pct < CERTEZA_ESPERADA) {
      recado = {
        tom: 'alerta',
        texto:
          `Você acerta ${daCerteza.pct}% das questões em que diz ter certeza. Certeza que falha uma em cada ` +
          `${Math.max(2, Math.round(100 / Math.max(1, 100 - daCerteza.pct)))} é o tipo de erro que aparece na prova, ` +
          'onde o nervosismo trabalha contra. Vale rever justamente o que você acha que já domina.',
      }
    } else if (acertosChutados >= Math.max(3, Math.round(comConfianca.length * 0.1))) {
      recado = {
        tom: 'neutro',
        texto:
          `${acertosChutados} dos seus acertos foram chute declarado — sorte, não conhecimento. Eles inflam o seu ` +
          'aproveitamento e não aumentam mais o prazo de revisão da questão, que volta logo.',
      }
    } else if (daCerteza.total >= 10) {
      recado = {
        tom: 'bom',
        texto:
          `Calibração boa: você acerta ${daCerteza.pct}% do que diz ter certeza. Quando você sente que sabe, você ` +
          'sabe — então pode confiar na própria sensação para decidir o que revisar.',
      }
    }
  }

  return { comConfianca: comConfianca.length, faixas, acertosChutados, errosComCerteza, pctSemSorte, recado }
}
