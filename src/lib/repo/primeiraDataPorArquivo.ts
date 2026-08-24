/**
 * Reduz as linhas de "Gerações IA" a uma data por ARQUIVO distinto: a da
 * primeira vez que aquele arquivo foi convertido.
 *
 * Duas decisões embutidas aqui, iguais nos dois repositórios de propósito:
 *
 * - Conta arquivos, não linhas. Um PDF grande é dividido em vários trechos e
 *   gera uma linha por aula; cobrar isso como vários PDFs seria mentira.
 * - Usa a PRIMEIRA data, não a última. É ela que decide quando o PDF sai da
 *   janela de 7 dias — usar a última faria uma reimportação do mesmo arquivo
 *   empurrar a renovação pra frente sem gastar cota nova.
 */
export function primeiraDataPorArquivo(linhas: { nome: string; data: string }[]): string[] {
  const primeira = new Map<string, string>()
  for (const { nome, data } of linhas) {
    const atual = primeira.get(nome)
    if (!atual || data < atual) primeira.set(nome, data)
  }
  return [...primeira.values()].sort()
}
