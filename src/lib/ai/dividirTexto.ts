/**
 * Divisão do texto de um PDF longo em partes, pra caber no tempo que a função
 * serverless tem por pedido.
 *
 * Vive separado de `pdfToAula` porque é manipulação de texto pura — não sabe o
 * que é um PDF, não importa `pdfjs`, e por isso dá pra testar sozinho.
 */

/**
 * Quanto do fim da parte anterior volta no começo da seguinte.
 *
 * Sem isto, um corte no lugar errado separa um TEXTO DE APOIO das questões que
 * dependem dele — clássico em Português: "Leia o texto para responder às
 * questões 1 a 5". O texto ficava numa parte, as questões na outra, e nenhuma
 * instrução de prompt resolve isso: a informação simplesmente não chegava
 * junto. 2.500 caracteres cobrem um texto de apoio típico com folga.
 *
 * O preço é pequeno e honesto: esses caracteres repetidos contam no medidor de
 * uso da IA. Num PDF de 20 partes, dá cerca de uma página a mais por parte.
 */
export const SOBREPOSICAO_CHARS = 2500

export const MARCA_CONTEXTO_INICIO = '--- CONTEXTO DA PARTE ANTERIOR (só para entender o que vem a seguir) ---'
export const MARCA_CONTEXTO_FIM = '--- FIM DO CONTEXTO. O MATERIAL DESTA PARTE COMEÇA AQUI ---'

// Acha, dentro de uma janela ao redor do alvo, a quebra de parágrafo mais
// próxima dele — pra não cortar uma questão ou um parágrafo ao meio. Sem
// nenhuma quebra na janela, corta exatamente no alvo mesmo assim.
function corteMaisProximo(texto: string, alvo: number, janela: number): number {
  const inicio = Math.max(0, alvo - janela)
  const fim = Math.min(texto.length, alvo + janela)
  const trecho = texto.slice(inicio, fim)

  let melhorCorte = -1
  let melhorDistancia = Infinity
  let pos = trecho.indexOf('\n\n')
  while (pos !== -1) {
    const corteAbsoluto = inicio + pos + 2
    const distancia = Math.abs(corteAbsoluto - alvo)
    if (distancia < melhorDistancia) {
      melhorDistancia = distancia
      melhorCorte = corteAbsoluto
    }
    pos = trecho.indexOf('\n\n', pos + 2)
  }
  return melhorCorte !== -1 ? melhorCorte : alvo
}

// Divide o texto em N partes de tamanho parecido, cada corte preferindo uma
// quebra de parágrafo perto do ponto ideal (i/numPartes do texto todo). Da
// segunda parte em diante, o fim da anterior volta marcado como contexto.
export function dividirTextoEmPartes(texto: string, numPartes: number): string[] {
  if (numPartes <= 1) return [texto.trim()]

  const janela = Math.floor((texto.length / numPartes) * 0.2)
  const cortes = Array.from({ length: numPartes - 1 }, (_, i) => {
    const alvo = Math.floor((texto.length * (i + 1)) / numPartes)
    return corteMaisProximo(texto, alvo, janela)
  })
  const cortesUnicos = Array.from(new Set(cortes)).sort((a, b) => a - b)

  const partes: string[] = []
  let anterior = 0
  for (const corte of cortesUnicos) {
    partes.push(texto.slice(anterior, corte).trim())
    anterior = corte
  }
  partes.push(texto.slice(anterior).trim())

  return partes
    .filter((p) => p.length > 0)
    .map((parte, i, todas) => {
      if (i === 0) return parte
      // `todas[i - 1]` é a parte anterior SEM o contexto dela própria: `map`
      // não altera o array que percorre, então a cauda aqui é conteúdo de
      // verdade, nunca contexto de contexto.
      const cauda = todas[i - 1].slice(-SOBREPOSICAO_CHARS).trim()
      if (!cauda) return parte
      return `${MARCA_CONTEXTO_INICIO}\n${cauda}\n${MARCA_CONTEXTO_FIM}\n\n${parte}`
    })
}
