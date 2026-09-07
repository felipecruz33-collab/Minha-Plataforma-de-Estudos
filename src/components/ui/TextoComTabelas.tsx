/**
 * Texto de questão que pode trazer TABELAS no meio.
 *
 * Questão de orçamento, de contabilidade, de estatística: metade do enunciado
 * está numa tabela, e sem ela não dá para responder. Só que a questão guarda
 * um campo de texto puro — mudar isso significaria coluna nova no banco,
 * migração, e um formato de JSON diferente do que já existe.
 *
 * Não precisa. A tabela viaja DENTRO do enunciado, escrita em linhas com
 * barras (o mesmo formato de tabela do Markdown), e é aqui que ela vira tabela
 * de verdade na tela:
 *
 *     | Descrição              | Valor         |
 *     | ---------------------- | ------------- |
 *     | Aquisição de uniformes | R$ 100.000,00 |
 *     | Total                  | R$ 774.938,00 |
 *
 * O JSON continua o mesmo, o banco continua o mesmo, e questão já importada
 * com a tabela escrita assim passa a aparecer certa sem reimportar nada.
 *
 * As células viram elementos React, nunca HTML injetado: o texto vem de um
 * arquivo que alguém montou (ou que uma IA escreveu), e nada nele deve poder
 * virar marcação executável.
 */

interface Tabela {
  tipo: 'tabela'
  /** `null` quando a tabela não trouxe linha de separação — aí não há cabeçalho. */
  cabecalho: string[] | null
  linhas: string[][]
}

type Segmento = { tipo: 'texto'; texto: string } | Tabela

/** Linha que começa e termina com barra. */
const LINHA_COM_BARRAS = /^\|.*\|$/
/** A linha de traços que separa cabeçalho de corpo: | --- | :---: | */
const SEPARADOR = /^\|(?:\s*:?-{2,}:?\s*\|)+$/

/** Divide pelas barras que não estão escapadas, e desfaz o escape. */
function celulas(linha: string): string[] {
  return linha
    .trim()
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}

/**
 * Quebra o texto em pedaços de texto comum e tabelas.
 *
 * Duas linhas de barras seguidas, no mínimo: uma linha solta com uma barra no
 * meio é frase, não tabela — e transformar frase em tabela seria pior do que
 * não reconhecer nada.
 */
export function separarTabelas(texto: string): Segmento[] {
  const linhas = texto.split('\n')
  const segmentos: Segmento[] = []
  let acumuladoTexto: string[] = []

  const despejarTexto = () => {
    if (acumuladoTexto.length === 0) return
    const junto = acumuladoTexto.join('\n')
    if (junto.trim()) segmentos.push({ tipo: 'texto', texto: junto.replace(/^\n+|\n+$/g, '') })
    acumuladoTexto = []
  }

  for (let i = 0; i < linhas.length; i++) {
    const atual = linhas[i].trim()
    const proxima = (linhas[i + 1] ?? '').trim()
    const comecaTabela =
      LINHA_COM_BARRAS.test(atual) && LINHA_COM_BARRAS.test(proxima) && celulas(atual).length >= 2

    if (!comecaTabela) {
      acumuladoTexto.push(linhas[i])
      continue
    }

    const bruto: string[] = []
    while (i < linhas.length && LINHA_COM_BARRAS.test(linhas[i].trim())) {
      bruto.push(linhas[i].trim())
      i++
    }
    i-- // o laço externo avança de novo

    const temCabecalho = bruto.length > 1 && SEPARADOR.test(bruto[1])
    const corpo = temCabecalho ? bruto.slice(2) : bruto
    const cabecalho = temCabecalho ? celulas(bruto[0]) : null
    const linhasCelulas = corpo.map(celulas).filter((l) => l.some((c) => c !== ''))

    // Só é tabela se sobrou conteúdo depois de tirar cabeçalho e separação.
    if (linhasCelulas.length === 0) {
      acumuladoTexto.push(...bruto)
      continue
    }

    // Uma linha torta não pode desmontar o desenho: todas ficam do tamanho da
    // maior, com célula vazia no que faltar.
    const colunas = Math.max(cabecalho?.length ?? 0, ...linhasCelulas.map((l) => l.length))
    const encaixar = (l: string[]) => Array.from({ length: colunas }, (_, c) => l[c] ?? '')

    despejarTexto()
    segmentos.push({
      tipo: 'tabela',
      cabecalho: cabecalho ? encaixar(cabecalho) : null,
      linhas: linhasCelulas.map(encaixar),
    })
  }

  despejarTexto()
  return segmentos
}

export function TextoComTabelas({ texto, className = '' }: { texto: string; className?: string }) {
  const segmentos = separarTabelas(texto)

  // Sem tabela nenhuma, é o parágrafo de sempre — o caminho comum não paga
  // nada por esta funcionalidade existir.
  if (segmentos.length === 1 && segmentos[0].tipo === 'texto') {
    return <p className={`whitespace-pre-line ${className}`}>{segmentos[0].texto}</p>
  }

  return (
    <div className={className}>
      {segmentos.map((seg, i) =>
        seg.tipo === 'texto' ? (
          <p key={i} className={`whitespace-pre-line ${i > 0 ? 'mt-3' : ''}`}>
            {seg.texto}
          </p>
        ) : (
          // A tabela rola DENTRO da própria caixa. Uma tabela larga que empurra
          // a página inteira quebra a tela toda — foi o que já aconteceu aqui
          // com um filtro comprido.
          <div key={i} className="my-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              {seg.cabecalho && (
                <thead>
                  <tr className="bg-slate-50">
                    {seg.cabecalho.map((c, j) => (
                      <th key={j} className="border-b border-slate-200 px-3 py-2 font-semibold text-navy">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {seg.linhas.map((linha, j) => (
                  <tr key={j} className={j % 2 ? 'bg-slate-50/60' : undefined}>
                    {linha.map((cel, k) => (
                      <td key={k} className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">
                        {cel}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  )
}
