/**
 * Intercalar assuntos dentro da fila.
 *
 * Estudar dez questões de "Metas fiscais" em sequência e depois dez de
 * "Crase" é prática em bloco. Alternar entre elas é prática intercalada — e a
 * intercalada rende mais: a meta-análise de Brunmair e Richter (2019), com 59
 * estudos e 238 tamanhos de efeito, encontra g = 0,42 a favor de intercalar.
 *
 * O motivo é o que a prova cobra. Em bloco, a pessoa aprende a RESOLVER o
 * exercício; intercalado, ela aprende a IDENTIFICAR com que tipo de problema
 * está lidando antes de resolver — que é exatamente o que uma prova de
 * concurso pede, onde as questões não vêm separadas por assunto e as
 * pegadinhas moram na semelhança entre institutos parecidos.
 *
 * Com uma ressalva honesta, da mesma meta-análise: para memorizar PALAVRAS
 * (vocabulário, pares de termos) o bloco ganhou, g = -0,39. Intercalar ajuda
 * a DISCRIMINAR entre coisas parecidas, não a decorar uma lista. Por isso
 * aqui ela é aplicada à fila de questões e cartões — onde o problema é
 * discriminar — e não a nenhuma tela de decorar.
 *
 * A intercalação aqui é CONSERVADORA: ela não reordena a fila por gosto, só
 * evita vizinhos do mesmo assunto. A ordem de prioridade (erro cometido com
 * certeza primeiro, depois o mais atrasado) é preservada sempre que possível
 * — adiantar uma questão de outro assunto por cima de uma prioritária
 * estragaria a parte da fila que mais importa.
 */

/**
 * Reordena de forma que itens vizinhos tenham assuntos diferentes, mantendo
 * a ordem original como critério dentro de cada escolha.
 *
 * Algoritmo: a cada passo, pega o PRIMEIRO item ainda não usado cujo assunto
 * seja diferente do anterior; se todos os restantes forem do mesmo assunto,
 * pega o primeiro mesmo assim (é o fim da fila, não há o que alternar).
 */
export function intercalarPorAssunto<T>(itens: T[], assuntoDe: (item: T) => string): T[] {
  if (itens.length < 3) return [...itens]

  const restantes = [...itens]
  const saida: T[] = []
  let anterior: string | null = null

  while (restantes.length > 0) {
    let i = restantes.findIndex((item) => assuntoDe(item) !== anterior)
    if (i === -1) i = 0
    const [escolhido] = restantes.splice(i, 1)
    saida.push(escolhido)
    anterior = assuntoDe(escolhido)
  }

  return saida
}
