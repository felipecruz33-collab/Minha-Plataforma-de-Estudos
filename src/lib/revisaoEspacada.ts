import type { Resposta } from './types'

/**
 * Repetição espaçada a partir do histórico que já existe.
 *
 * A ideia é velha e bem estabelecida: você esquece pouco depois de aprender, e
 * cada vez que lembra na hora certa a curva do esquecimento fica mais longa.
 * Então uma questão errada não deve voltar "quando der" — deve voltar amanhã,
 * e ir se afastando conforme você acerta.
 *
 * O que torna isto barato aqui: NÃO precisa de tabela nova, nem de coluna
 * nova, nem de nada gravado. A tabela `respostas` já guarda toda resposta com
 * data e acerto/erro; o estado de revisão de cada questão é uma leitura desse
 * histórico. Se amanhã a régua mudar, muda só este arquivo — nenhum dado
 * gravado fica errado, porque nada aqui é gravado.
 */

/**
 * Escada de intervalos, em dias, indexada por acertos seguidos DEPOIS do
 * último erro.
 *
 * 0 acertos (acabou de errar) -> volta amanhã.
 * 1 acerto  -> 3 dias.  2 -> 7 dias.  3 -> 21 dias.  4 ou mais -> 60 dias.
 *
 * Os saltos crescem cerca de 3x porque é assim que o intervalo acompanha a
 * memória: lembrar de novo depois de 3 semanas vale muito mais que lembrar
 * depois de 3 dias. O último degrau não vira "nunca mais" de propósito —
 * questão de concurso que você não vê há dois meses volta a escapar.
 */
export const ESCADA_DIAS = [1, 3, 7, 21, 60] as const

/** A partir daqui a questão é considerada dominada (último degrau da escada). */
export const ACERTOS_PARA_DOMINAR = ESCADA_DIAS.length - 1

const DIA_MS = 24 * 60 * 60 * 1000

/** Só a data, sem hora: o ciclo é contado em dias de calendário, não em 24h exatas. */
function diaDe(iso: string): string {
  return iso.slice(0, 10)
}

function somarDias(dia: string, dias: number): string {
  return new Date(new Date(`${dia}T00:00:00`).getTime() + dias * DIA_MS).toISOString().slice(0, 10)
}

function diferencaEmDias(de: string, ate: string): number {
  return Math.round((new Date(`${ate}T00:00:00`).getTime() - new Date(`${de}T00:00:00`).getTime()) / DIA_MS)
}

export interface EstadoRevisao {
  questaoId: string
  /** Data (YYYY-MM-DD) da resposta mais recente desta questão. */
  ultimaEm: string
  /** Acertos seguidos desde o último erro. */
  acertosSeguidos: number
  /** Se a última resposta foi certa. */
  ultimaCorreta: boolean
  /** Quantas vezes a questão já foi respondida. */
  tentativas: number
  /** Dias de espera do degrau atual. */
  intervaloDias: number
  /** Dia (YYYY-MM-DD) em que a questão volta. */
  voltaEm: string
  /** Negativo quando já passou da hora — quanto mais negativo, mais atrasada. */
  diasAteVoltar: number
  /** Já passou da hora de rever. */
  vencida: boolean
  /** Chegou ao último degrau da escada. */
  dominada: boolean
}

/**
 * Estado de revisão de cada questão que a pessoa JÁ ERROU alguma vez.
 *
 * Quem nunca errou não entra no ciclo: o caderno de revisão existe pra
 * recuperar o que falhou, não pra reapresentar o que já está resolvido — isso
 * só encheria a lista e faria a pessoa parar de olhar pra ela.
 */
export function estadosDeRevisao(respostas: Resposta[], hoje = new Date()): Map<string, EstadoRevisao> {
  const porQuestao = new Map<string, Resposta[]>()
  for (const r of respostas) {
    const lista = porQuestao.get(r.questaoId)
    if (lista) lista.push(r)
    else porQuestao.set(r.questaoId, [r])
  }

  const diaHoje = hoje.toISOString().slice(0, 10)
  const estados = new Map<string, EstadoRevisao>()

  for (const [questaoId, lista] of porQuestao) {
    const emOrdem = [...lista].sort((a, b) => a.respondidoEm.localeCompare(b.respondidoEm))

    let errouAlgumaVez = false
    let acertosSeguidos = 0
    for (const r of emOrdem) {
      if (r.correta) acertosSeguidos += 1
      else {
        errouAlgumaVez = true
        acertosSeguidos = 0
      }
    }
    if (!errouAlgumaVez) continue

    const ultima = emOrdem[emOrdem.length - 1]
    const degrau = Math.min(acertosSeguidos, ESCADA_DIAS.length - 1)
    const intervaloDias = ESCADA_DIAS[degrau]
    const ultimaEm = diaDe(ultima.respondidoEm)
    const voltaEm = somarDias(ultimaEm, intervaloDias)
    const diasAteVoltar = diferencaEmDias(diaHoje, voltaEm)

    estados.set(questaoId, {
      questaoId,
      ultimaEm,
      acertosSeguidos,
      ultimaCorreta: ultima.correta,
      tentativas: emOrdem.length,
      intervaloDias,
      voltaEm,
      diasAteVoltar,
      vencida: diasAteVoltar <= 0,
      dominada: acertosSeguidos >= ACERTOS_PARA_DOMINAR,
    })
  }

  return estados
}

/** Ids das questões que já passaram da hora, das mais atrasadas para as menos. */
export function vencidasPrimeiro(estados: Map<string, EstadoRevisao>): EstadoRevisao[] {
  return Array.from(estados.values())
    .filter((e) => e.vencida)
    .sort((a, b) => a.diasAteVoltar - b.diasAteVoltar || a.ultimaEm.localeCompare(b.ultimaEm))
}

/** "hoje", "amanhã", "em 5 dias", "atrasada há 3 dias" — texto pronto pra tela. */
export function textoDoPrazo(e: EstadoRevisao): string {
  if (e.diasAteVoltar < 0) {
    const dias = Math.abs(e.diasAteVoltar)
    return `atrasada há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
  }
  if (e.diasAteVoltar === 0) return 'volta hoje'
  if (e.diasAteVoltar === 1) return 'volta amanhã'
  return `volta em ${e.diasAteVoltar} dias`
}
