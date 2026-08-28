/**
 * Normaliza um texto para busca: sem acento, sem maiúscula.
 *
 * Ninguém digita "órgão" no teclado do celular quando está com pressa — digita
 * "orgao". Sem isto, a busca simplesmente não encontra, e a pessoa conclui que
 * a questão não existe no banco dela.
 *
 * `NFD` separa a letra do acento em dois caracteres; o `replace` joga fora a
 * parte do acento e deixa a letra.
 */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Se todas as palavras do termo aparecem no texto.
 *
 * Palavra a palavra, e não a frase inteira: quem procura "crase antes de
 * pronome" quase nunca escreve exatamente a ordem que está no enunciado. Exigir
 * a frase literal transformaria a busca numa adivinhação da redação original.
 */
export function contemTodasAsPalavras(texto: string, termo: string): boolean {
  const alvo = normalizarParaBusca(texto)
  return normalizarParaBusca(termo)
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => alvo.includes(palavra))
}
