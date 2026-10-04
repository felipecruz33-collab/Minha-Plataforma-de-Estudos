import type { EstadoDoCicloRevisao, Resposta } from './types'

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

/**
 * A escada ESTICADA, usada quando o assunto da questão já está sendo treinado
 * em flashcard.
 *
 * O motivo é evitar trabalho em dobro sobre o mesmo conteúdo. Quem tem um
 * baralho de "Metas fiscais" já recupera aquilo ativamente a cada poucos
 * dias; a questão não precisa voltar com a mesma pressa — o papel dela passa
 * a ser outro, o de cobrar no FORMATO DA PROVA, com alternativas e pegadinha,
 * e isso rende espaçado.
 *
 * Os números não são chute. A meta-análise de Cepeda e colegas (2006, 254
 * estudos) encontra que o intervalo ótimo fica em torno de 10 a 20% do tempo
 * que você precisa reter a informação. Para um concurso daqui a seis meses a
 * um ano (180 a 365 dias), isso dá algo entre 18 e 73 dias — faixa que os
 * degraus de cima desta escada ocupam e que a escada normal, parando em 60,
 * mal encosta.
 *
 * Cada degrau é o seguinte da escada normal, com um topo novo: a questão
 * entra um passo à frente porque o flashcard já cobriu o passo que ela
 * pularia.
 */
export const ESCADA_DIAS_COM_FLASHCARD = [3, 7, 21, 60, 120] as const

/**
 * UM ACERTO POR DIA, e não um acerto por clique.
 *
 * Refazer a mesma questão três vezes na mesma noite não vale três degraus da
 * escada, e isto não é opinião: Rawson e Dunlosky (2011, 2013) mediram as duas
 * coisas lado a lado. Quem recuperou cada item CERTO UMA VEZ EM CADA DE TRÊS
 * SESSÕES ESPAÇADAS lembrou mais do que o DOBRO de quem acertou o mesmo item
 * três vezes dentro de uma sessão só. É o mesmo esforço com resultado
 * diferente — o que consolida é o intervalo entre as recuperações, não a
 * quantidade delas.
 *
 * Antes daqui a escada contava clique: três acertos seguidos na mesma noite
 * jogavam a questão para 21 dias como se ela tivesse sido recuperada em três
 * dias diferentes. O prazo ficava grande sem a memória ter ficado forte — que
 * é o pior dos dois mundos, porque a questão só volta quando já foi esquecida.
 *
 * Errar continua valendo na hora, sempre: um erro é informação nova no
 * instante em que acontece, e zerar o degrau na hora é o que o ciclo existe
 * para fazer.
 */
const UM_ACERTO_POR_DIA = true

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
  /**
   * Acertos que NÃO contaram porque foram repetição no mesmo dia.
   *
   * Serve para a tela avisar em vez de parecer que perdeu o acerto da pessoa —
   * ver `UM_ACERTO_POR_DIA`.
   */
  acertosNoMesmoDia: number
  /** Dias de espera do degrau atual. */
  intervaloDias: number
  /** Dia (YYYY-MM-DD) em que a questão volta. */
  voltaEm: string
  /** Negativo quando já passou da hora — quanto mais negativo, mais atrasada. */
  diasAteVoltar: number
  /** Já passou da hora de rever. */
  vencida: boolean
  /** O ciclo inteiro está pausado — o prazo desta questão está congelado. */
  pausada: boolean
  /** O prazo foi esticado porque o assunto já está em flashcard. */
  esticadaPorFlashcard: boolean
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
export function estadosDeRevisao(
  respostas: Resposta[],
  hoje = new Date(),
  ciclo?: EstadoDoCicloRevisao | null,
  /**
   * Questões cujo assunto já tem baralho de flashcards. Elas usam a escada
   * esticada — ver `ESCADA_DIAS_COM_FLASHCARD`.
   *
   * Vem pronto de fora, por questão e não por assunto, porque `Resposta` não
   * carrega o tema: quem sabe o assunto de cada questão é a tela, que tem o
   * acervo em mãos.
   */
  questoesComFlashcard?: Set<string>,
): Map<string, EstadoRevisao> {
  const porQuestao = new Map<string, Resposta[]>()
  for (const r of respostas) {
    // RECOMEÇO: o que foi respondido antes do marco não entra mais no ciclo.
    // A resposta continua no banco e continua contando no Desempenho — ela só
    // deixa de gerar dívida de revisão, que é o pedido de quem troca de
    // concurso e não quer arrastar o material antigo.
    if (ciclo?.reinicio && r.respondidoEm < ciclo.reinicio) continue
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
    /** Dia do último acerto que CONTOU — ver `UM_ACERTO_POR_DIA`. */
    let diaDoUltimoAcertoContado: string | null = null
    /** Acertos repetidos no mesmo dia, só para a tela poder explicar. */
    let acertosNoMesmoDia = 0
    for (const r of emOrdem) {
      if (r.correta) {
        const dia = diaDe(r.respondidoEm)
        if (UM_ACERTO_POR_DIA && dia === diaDoUltimoAcertoContado) {
          acertosNoMesmoDia += 1
          continue
        }
        acertosSeguidos += 1
        diaDoUltimoAcertoContado = dia
      } else {
        errouAlgumaVez = true
        acertosSeguidos = 0
        diaDoUltimoAcertoContado = null
        acertosNoMesmoDia = 0
      }
    }
    if (!errouAlgumaVez) continue

    const ultima = emOrdem[emOrdem.length - 1]
    const escada = questoesComFlashcard?.has(questaoId) ? ESCADA_DIAS_COM_FLASHCARD : ESCADA_DIAS
    const degrau = Math.min(acertosSeguidos, escada.length - 1)
    const intervaloDias = escada[degrau]
    // PAUSA: quem parou não volta para um muro de atraso. Uma resposta anterior
    // à retomada conta como se tivesse sido dada NO DIA da volta — o prazo
    // recomeça dali, e o degrau da escada que a pessoa já tinha conquistado é
    // preservado. Resposta dada DEPOIS da volta usa a data real dela, senão o
    // que ela responde hoje nasceria com prazo deslocado.
    const referencia =
      ciclo?.retomadaEm && ultima.respondidoEm < ciclo.retomadaEm ? ciclo.retomadaEm : ultima.respondidoEm
    const ultimaEm = diaDe(referencia)
    const voltaEm = somarDias(ultimaEm, intervaloDias)
    const diasAteVoltar = diferencaEmDias(diaHoje, voltaEm)

    estados.set(questaoId, {
      questaoId,
      ultimaEm,
      acertosSeguidos,
      ultimaCorreta: ultima.correta,
      tentativas: emOrdem.length,
      acertosNoMesmoDia,
      intervaloDias,
      voltaEm,
      diasAteVoltar,
      // Pausado: o relógio para. Nada vence, e a tela fica calma — que é o
      // motivo de existir o botão.
      vencida: !ciclo?.pausadaEm && diasAteVoltar <= 0,
      pausada: !!ciclo?.pausadaEm,
      esticadaPorFlashcard: !!questoesComFlashcard?.has(questaoId),
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
  // Pausado, o prazo está congelado. Dizer "atrasada há 39 dias" aqui
  // contradiria o aviso logo acima na mesma tela ("nada vence enquanto isso") —
  // e é a contradição que faz a pessoa desconfiar do resto.
  if (e.pausada) return 'em pausa'
  if (e.diasAteVoltar < 0) {
    const dias = Math.abs(e.diasAteVoltar)
    return `atrasada há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
  }
  if (e.diasAteVoltar === 0) return 'volta hoje'
  if (e.diasAteVoltar === 1) return 'volta amanhã'
  return `volta em ${e.diasAteVoltar} dias`
}
