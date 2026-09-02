import type { ItemCronograma, SemanaCronograma } from './types'

/**
 * A semana vista dia a dia, e o remanejamento do que não foi feito.
 *
 * O cronograma antigo era honesto mas passivo: gerava as semanas e ficava
 * olhando. Quem atrasava via a semana passada com três tarefas em aberto e a
 * semana atual fingindo que estava tudo bem — e como ninguém volta pra semana
 * anterior, aquilo virava dívida invisível.
 *
 * Aqui mora a parte que decide. Tudo puro, sem React e sem repositório: quem
 * grava é a tela, e só quando algo realmente mudou.
 */

/** Domingo a sábado, na ordem que `Date.getDay()` devolve. */
const NOMES_DIA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/**
 * Lê 'YYYY-MM-DD' como data LOCAL.
 *
 * `new Date('2026-09-22')` seria interpretado como UTC e, num fuso a oeste,
 * voltaria como dia 21 — a semana inteira apareceria deslocada em um dia.
 */
function paraDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

function paraISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function somarDias(iso: string, dias: number): string {
  const d = paraDataLocal(iso)
  d.setDate(d.getDate() + dias)
  return paraISO(d)
}

/** Quantos dias a semana cobre — a última pode ser mais curta que 7. */
export function tamanhoDaSemana(semana: SemanaCronograma): number {
  const dias = Math.round((paraDataLocal(semana.fimEm).getTime() - paraDataLocal(semana.inicioEm).getTime()) / 86_400_000) + 1
  return Math.min(7, Math.max(1, dias))
}

export interface DiaDaSemana {
  /** 0 = primeiro dia da semana. */
  indice: number
  dataISO: string
  /** "Seg, 22/09" */
  rotulo: string
  ehHoje: boolean
  ehPassado: boolean
  itens: ItemCronograma[]
}

/**
 * A semana aberta em dias.
 *
 * `semDia` recolhe as tarefas sem dia marcado — cronogramas criados antes
 * desta divisão, e tudo que foi remanejado (a tarefa volta sem data pra pessoa
 * escolher quando encaixar). Elas não somem: aparecem num grupo próprio.
 */
export function diasDaSemana(semana: SemanaCronograma, hoje: string): { dias: DiaDaSemana[]; semDia: ItemCronograma[] } {
  const total = tamanhoDaSemana(semana)
  const dias: DiaDaSemana[] = []
  for (let i = 0; i < total; i++) {
    const dataISO = somarDias(semana.inicioEm, i)
    dias.push({
      indice: i,
      dataISO,
      rotulo: `${NOMES_DIA[paraDataLocal(dataISO).getDay()]}, ${dataISO.slice(8)}/${dataISO.slice(5, 7)}`,
      ehHoje: dataISO === hoje,
      ehPassado: dataISO < hoje,
      itens: [],
    })
  }

  const semDia: ItemCronograma[] = []
  for (const item of semana.itens) {
    const d = item.dia
    if (typeof d === 'number' && d >= 0 && d < dias.length) dias[d].itens.push(item)
    else semDia.push(item)
  }
  return { dias, semDia }
}

/**
 * Espalha as tarefas pelos dias da semana, em ordem.
 *
 * Divisão simples de propósito: o app não sabe quanto tempo cada aula toma nem
 * em que dias a pessoa consegue estudar. Inventar um peso por tarefa seria
 * fingir uma informação que ninguém deu — e a pessoa pode mover cada item de
 * dia depois, que é a forma honesta de personalizar isso.
 */
export function distribuirPorDia(itens: ItemCronograma[], diasDisponiveis: number): ItemCronograma[] {
  if (itens.length === 0 || diasDisponiveis <= 0) return itens
  // ESPALHA em vez de empilhar. Encher os primeiros dias e deixar o resto da
  // semana livre daria uma semana pior do que a de antes: duas tarefas caem na
  // segunda e na terça, e de quarta a domingo o cronograma não pede nada.
  // `i * dias / total` distribui do primeiro ao último dia, seja qual for a
  // proporção — e nunca passa do último dia.
  return itens.map((item, i) => ({ ...item, dia: Math.floor((i * diasDisponiveis) / itens.length) }))
}

export interface ResultadoRemanejo {
  semanas: SemanaCronograma[]
  /** Quantas tarefas mudaram de semana. */
  movidas: number
  /** Números das semanas de onde elas saíram, em ordem. */
  semanasDeOrigem: number[]
  /** Semana que recebeu tudo. */
  paraSemana: number
}

/**
 * Traz para a semana corrente tudo que ficou em aberto nas semanas que já
 * terminaram.
 *
 * Três decisões que valem explicação:
 *
 * 1. Só move o que NÃO foi feito, e só de semanas já encerradas. A semana
 *    atual, mesmo com tarefa em aberto, está no prazo.
 * 2. A tarefa chega SEM dia marcado. O dia que ela tinha era da outra semana;
 *    reaproveitar aquele número encaixaria a tarefa num dia aleatório. Quem
 *    decide quando fazer é a pessoa.
 * 3. `veioDaSemana` guarda a origem PRIMEIRA. Uma tarefa arrastada por três
 *    semanas continua dizendo de onde saiu, em vez de dizer "veio da semana
 *    passada" pra sempre e esconder o tamanho do atraso.
 *
 * Devolve `null` quando não há nada a fazer — é assim que a tela sabe que não
 * precisa gravar. Sem isso, toda visita ao cronograma viraria uma escrita no
 * banco.
 */
export function remanejarPendentes(semanas: SemanaCronograma[], hoje: string): ResultadoRemanejo | null {
  if (semanas.length === 0) return null

  // O cronograma ainda nem começou: não existe "atrasado".
  if (hoje < semanas[0].inicioEm) return null

  const atual = semanas.find((s) => s.inicioEm <= hoje && hoje <= s.fimEm) ?? semanas[semanas.length - 1]

  const pendentes: ItemCronograma[] = []
  const origens = new Set<number>()

  const semanasLimpas = semanas.map((s) => {
    if (s.numero >= atual.numero || s.fimEm >= hoje) return s
    const emAberto = s.itens.filter((i) => !i.concluido)
    if (emAberto.length === 0) return s
    for (const item of emAberto) {
      pendentes.push({ ...item, dia: null, veioDaSemana: item.veioDaSemana ?? s.numero })
      origens.add(item.veioDaSemana ?? s.numero)
    }
    return { ...s, itens: s.itens.filter((i) => i.concluido) }
  })

  if (pendentes.length === 0) return null

  return {
    semanas: semanasLimpas.map((s) => (s.numero === atual.numero ? { ...s, itens: [...s.itens, ...pendentes] } : s)),
    movidas: pendentes.length,
    semanasDeOrigem: Array.from(origens).sort((a, b) => a - b),
    paraSemana: atual.numero,
  }
}
