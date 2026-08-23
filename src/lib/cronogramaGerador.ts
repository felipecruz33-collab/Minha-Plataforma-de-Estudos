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
 * Gera as semanas automaticamente: intercala as aulas das matérias escolhidas
 * (round-robin, pra variar de matéria dentro da mesma semana) e distribui
 * em partes iguais pelas semanas de estudo. Reserva a última semana pra
 * revisão geral quando o cronograma tem 2 semanas ou mais.
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
  for (let n = 1; n <= semanasEstudo; n++) {
    const fimSemana = addDias(cursor, 6)
    const itensSemana = unidades.slice(ponteiro, ponteiro + porSemana)
    ponteiro += porSemana
    semanas.push({
      numero: n,
      inicioEm: paraISODate(cursor),
      fimEm: paraISODate(fimSemana),
      itens: itensSemana.map((u) => ({
        id: crypto.randomUUID(),
        materiaId: u.materiaId,
        materiaNome: u.materiaNome,
        aulaId: u.aulaId,
        descricao: u.descricao,
        concluido: false,
      })),
    })
    cursor = addDias(cursor, 7)
  }

  if (temRevisao) {
    semanas.push({
      numero: semanasEstudo + 1,
      inicioEm: paraISODate(cursor),
      fimEm: dataFim,
      itens: materias.map((m) => ({
        id: crypto.randomUUID(),
        materiaId: m.materiaId,
        materiaNome: m.materiaNome,
        aulaId: null,
        descricao: `Revisão geral — ${m.materiaNome}`,
        concluido: false,
      })),
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
