import { distribuirPorDia } from './cronogramaSemana'
import type { SemanaCronograma } from './types'

export interface MateriaParaCronograma {
  materiaId: string
  materiaNome: string
  aulas: { id: string; titulo: string }[]
}

function addDias(data: Date, dias: number): Date {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

function paraISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function paraData(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

function contarSemanas(dataInicio: string, dataFim: string): number {
  const dias = Math.round((paraData(dataFim).getTime() - paraData(dataInicio).getTime()) / 86_400_000) + 1
  return Math.max(1, Math.ceil(Math.max(1, dias) / 7))
}

/**
 * Quando cada aula volta para revisão, em semanas depois da semana em que foi
 * estudada.
 *
 * Uma semana depois, e de novo três semanas depois — distância crescente, que
 * é como o intervalo acompanha a memória. A escolha dos números vem da
 * meta-análise de Cepeda e colegas (2006, 254 estudos): o intervalo ótimo
 * fica em torno de 10 a 20% do tempo que você precisa reter a informação.
 * Para um concurso daqui a seis meses a um ano, isso dá de 18 a 73 dias — ou
 * seja, revisão medida em SEMANAS, não a semana única empilhada no fim do
 * plano.
 *
 * E é esse o ponto da mudança: uma "semana de revisão geral" no fim é
 * revisão em bloco, o que a literatura inteira de prática distribuída trata
 * como o arranjo ruim. Rever a aula uma vez por semana durante três semanas
 * custa o mesmo tempo e rende outra coisa.
 */
export const REVISOES_EM_SEMANAS = [1, 3] as const

/**
 * Quanto da semana pode ser revisão, em fração da carga de aulas novas.
 *
 * Meia carga: a semana fica cerca de 50% mais cheia do que ficaria só com a
 * primeira passada — e isso é honesto, porque revisar FAZ PARTE do plano, não
 * é um extra. O teto existe para o plano não virar uma semana de trinta
 * itens, que ninguém cumpre e por isso ninguém abre.
 */
const FRACAO_DE_REVISAO = 0.5

/**
 * Gera as semanas automaticamente: intercala as aulas das matérias escolhidas
 * (round-robin, pra variar de matéria dentro da mesma semana), distribui em
 * partes iguais pelas semanas de estudo e AGENDA A REVISÃO de cada aula uma e
 * três semanas depois — ver `REVISOES_EM_SEMANAS`. Reserva a última semana
 * pra revisão geral quando o cronograma tem 2 semanas ou mais, e é lá que
 * caem as revisões que não couberam antes do fim.
 */
export function gerarSemanasAutomatico(dataInicio: string, dataFim: string, materias: MateriaParaCronograma[]): SemanaCronograma[] {
  const totalSemanas = contarSemanas(dataInicio, dataFim)
  const temRevisao = totalSemanas >= 2
  const semanasEstudo = temRevisao ? totalSemanas - 1 : totalSemanas

  const filas = materias.map((m) =>
    m.aulas.map((a) => ({ materiaId: m.materiaId, materiaNome: m.materiaNome, aulaId: a.id as string | null, descricao: a.titulo })),
  )
  const unidades: { materiaId: string; materiaNome: string; aulaId: string | null; descricao: string }[] = []
  for (let idx = 0, restante = true; restante; idx++) {
    restante = false
    for (const fila of filas) {
      if (fila[idx]) {
        unidades.push(fila[idx])
        restante = true
      }
    }
  }
  // Matéria sem nenhuma aula cadastrada ainda: entra como item genérico, pra não sumir do plano.
  for (const m of materias) {
    if (m.aulas.length === 0) {
      unidades.push({ materiaId: m.materiaId, materiaNome: m.materiaNome, aulaId: null, descricao: `Estudar ${m.materiaNome}` })
    }
  }

  const porSemana = Math.max(1, Math.ceil(unidades.length / semanasEstudo))

  const semanas: SemanaCronograma[] = []
  let cursor = paraData(dataInicio)
  let ponteiro = 0
  const revisoesPorSemana = Math.max(1, Math.round(porSemana * FRACAO_DE_REVISAO))

  /**
   * Revisões esperando vez, em ordem de quando deveriam acontecer.
   *
   * Fila, e não agendamento fixo, porque a semana tem teto: a revisão que não
   * couber hoje escorrega para a semana seguinte em vez de ser descartada —
   * uma revisão uma semana atrasada ainda vale; uma revisão que não acontece
   * não vale nada.
   */
  const filaDeRevisao: { devidaNaSemana: number; daSemana: number; unidade: (typeof unidades)[number] }[] = []

  for (let n = 1; n <= semanasEstudo; n++) {
    const fimSemana = addDias(cursor, 6)
    const novas = unidades.slice(ponteiro, ponteiro + porSemana)
    ponteiro += porSemana

    // Primeiro as revisões devidas (as mais antigas na frente), até o teto.
    const devidas = filaDeRevisao.filter((r) => r.devidaNaSemana <= n).slice(0, revisoesPorSemana)
    for (const r of devidas) filaDeRevisao.splice(filaDeRevisao.indexOf(r), 1)

    const itens = [
      ...novas.map((u) => ({
        id: crypto.randomUUID(),
        materiaId: u.materiaId,
        materiaNome: u.materiaNome,
        aulaId: u.aulaId,
        descricao: u.descricao,
        concluido: false,
      })),
      ...devidas.map((r) => ({
        id: crypto.randomUUID(),
        materiaId: r.unidade.materiaId,
        materiaNome: r.unidade.materiaNome,
        aulaId: r.unidade.aulaId,
        descricao: `Revisar — ${r.unidade.descricao}`,
        concluido: false,
        revisaoDaSemana: r.daSemana,
      })),
    ]

    semanas.push({
      numero: n,
      inicioEm: paraISODate(cursor),
      fimEm: paraISODate(fimSemana),
      // Espalhadas pelos 7 dias em vez de empilhadas na semana: a semana
      // projetada dia a dia é o que transforma "estude isto nos próximos 7
      // dias" em algo que dá pra abrir de manhã e saber o que fazer hoje.
      itens: distribuirPorDia(itens, 7),
    })

    // Só depois de montar a semana: aula estudada nela volta daqui a uma e a
    // três semanas. Aula genérica (matéria sem aula cadastrada) não gera
    // revisão — não há o que revisar de um item que diz "estudar Português".
    for (const u of novas) {
      if (!u.aulaId) continue
      for (const daqui of REVISOES_EM_SEMANAS) {
        filaDeRevisao.push({ devidaNaSemana: n + daqui, daSemana: n, unidade: u })
      }
    }

    cursor = addDias(cursor, 7)
  }

  if (temRevisao) {
    // A última semana: revisão geral por matéria MAIS as revisões que não
    // couberam nas semanas anteriores. Elas vêm primeiro, porque são
    // específicas — "revisar a aula de improbidade" é uma tarefa que a pessoa
    // sabe fazer; "revisão geral de Direito Administrativo" é um lembrete.
    //
    // O corte aqui existe porque a fila pode chegar grande, e uma última
    // semana com cinquenta itens é uma semana que ninguém abre. O que fica de
    // fora não é perdido: o ciclo de revisão das questões erradas e os
    // flashcards continuam cobrando esse conteúdo todos os dias.
    const pendentes = filaDeRevisao.slice(0, Math.max(1, porSemana))
    semanas.push({
      numero: semanasEstudo + 1,
      inicioEm: paraISODate(cursor),
      fimEm: dataFim,
      // A semana de revisão também é dividida por dia — ela nascia sem dia
      // nenhum e caía inteira no grupo "sem dia marcado".
      itens: distribuirPorDia(
        [
          ...pendentes.map((r) => ({
            id: crypto.randomUUID(),
            materiaId: r.unidade.materiaId,
            materiaNome: r.unidade.materiaNome,
            aulaId: r.unidade.aulaId,
            descricao: `Revisar — ${r.unidade.descricao}`,
            concluido: false,
            revisaoDaSemana: r.daSemana,
          })),
          ...materias.map((m) => ({
            id: crypto.randomUUID(),
            materiaId: m.materiaId,
            materiaNome: m.materiaNome,
            aulaId: null,
            descricao: `Revisão geral — ${m.materiaNome}`,
            concluido: false,
          })),
        ],
        7,
      ),
    })
  }

  return semanas
}

/** Gera só o esqueleto de semanas vazias, pra a pessoa preencher semana a semana. */
export function gerarSemanasManual(dataInicio: string, dataFim: string): SemanaCronograma[] {
  const totalSemanas = contarSemanas(dataInicio, dataFim)
  const semanas: SemanaCronograma[] = []
  let cursor = paraData(dataInicio)
  for (let n = 1; n <= totalSemanas; n++) {
    const fimSemana = n === totalSemanas ? dataFim : paraISODate(addDias(cursor, 6))
    semanas.push({ numero: n, inicioEm: paraISODate(cursor), fimEm: fimSemana, itens: [] })
    cursor = addDias(cursor, 7)
  }
  return semanas
}
