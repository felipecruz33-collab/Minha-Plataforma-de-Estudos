import type { AulaImportPayload } from '../types'

/**
 * Junta as aulas geradas a partir de pedaços do MESMO PDF numa aula só.
 *
 * Por que existe: o tempo de resposta de uma IA é dominado pelo tanto que
 * ela escreve (a saída sai token a token, sequencialmente), não pelo tanto
 * que ela lê. Um PDF inteiro de uma vez pede uma saída gigante — reescrita
 * didática completa + todas as questões + explicação de cada alternativa —
 * que não cabe no tempo que a função serverless tem por pedido. A solução é
 * gerar em pedaços pequenos, um por vez (cada chamada com sua própria
 * janela de tempo), e costurar tudo aqui no final. Assim o usuário continua
 * recebendo UMA aula completa, e não vários fragmentos soltos na biblioteca.
 *
 * Cuidado importante: `ordem` é sequencial e única dentro de cada aula — o
 * validador de importação (`src/lib/schema.ts`) rejeita `ordem` repetida.
 * Como cada pedaço é compilado isoladamente, todos começam do zero, então
 * renumerar aqui não é cosmético: sem isso a aula mesclada seria recusada.
 */
export function mesclarAulasDoMesmoPdf(payloads: AulaImportPayload[]): AulaImportPayload[] {
  if (payloads.length === 0) return []
  if (payloads.length === 1) return payloads

  const materia = payloads.find((p) => p.materia?.trim())?.materia ?? payloads[0].materia
  const titulo = payloads.find((p) => p.aula.titulo?.trim())?.aula.titulo ?? payloads[0].aula.titulo

  const blocos = payloads
    .flatMap((p) => p.aula.blocos)
    // Renumera pela posição final; os blocos de cada pedaço já vêm na ordem
    // de leitura, e os pedaços são processados na ordem do PDF.
    .map((b, i) => ({ ...b, ordem: i }))

  // Questões repetidas NÃO são removidas de propósito: se a mesma questão
  // aparece duas vezes no material original, o contrato do prompt manda
  // preservar as duas. Os pedaços não se sobrepõem, então repetição aqui
  // significa repetição no PDF de verdade.
  const questoes = payloads.flatMap((p) => p.aula.questoes)

  return [{ materia, aula: { titulo, blocos, questoes } }]
}
