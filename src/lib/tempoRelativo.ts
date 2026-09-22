/**
 * "agora há pouco", "há 3 dias", "em 12/03" — para carimbar quando uma
 * anotação foi editada pela última vez.
 *
 * Relativo perto, absoluto longe. Data cheia para algo de dois minutos atrás
 * obriga a pessoa a fazer a conta de cabeça; "há 47 dias" para algo do
 * semestre passado também. A virada fica numa semana, que é o ponto em que
 * "há N dias" para de ajudar.
 */
const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

export function tempoRelativo(iso: string, agora = new Date()): string {
  const quando = new Date(iso)
  const diferenca = agora.getTime() - quando.getTime()

  // Relógio do aparelho atrasado em relação ao servidor faz uma edição recente
  // parecer do futuro. Tratar como "agora há pouco" é mais honesto do que
  // escrever "há -2 minutos".
  if (diferenca < MINUTO) return 'agora há pouco'
  if (diferenca < HORA) {
    const min = Math.floor(diferenca / MINUTO)
    return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`
  }
  if (diferenca < DIA) {
    const horas = Math.floor(diferenca / HORA)
    return `há ${horas} ${horas === 1 ? 'hora' : 'horas'}`
  }
  if (diferenca < 7 * DIA) {
    const dias = Math.floor(diferenca / DIA)
    return dias === 1 ? 'ontem' : `há ${dias} dias`
  }
  return quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
