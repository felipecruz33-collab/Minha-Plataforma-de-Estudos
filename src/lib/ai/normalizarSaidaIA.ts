/**
 * Ajusta a saída bruta da IA para o formato que o schema intermediário
 * espera, ANTES da validação.
 *
 * Por que isso existe: o Gemini aceita um JSON Schema que força a estrutura,
 * mas Groq e OpenRouter não têm essa garantia — e no caso da OpenRouter o
 * modelo é sorteado entre vários gratuitos, cada um com suas manias. Mesmo
 * pedindo `json_schema`, a própria OpenRouter avisa que alguns provedores
 * tratam o schema como "sugestão forte", não como regra.
 *
 * O resultado é que a IA acerta o conteúdo mas erra a embalagem: omite um
 * campo em vez de mandar string vazia, manda o ano como número, devolve as
 * alternativas como objeto em vez de lista. Rejeitar tudo isso desperdiça
 * uma geração inteira que estava boa.
 *
 * Então aqui a gente é tolerante no que ACEITA — mas sem inventar conteúdo:
 * nada aqui cria texto, questão ou alternativa. Só reorganiza o que veio e
 * preenche vazios com "". O schema continua sendo a autoridade final; isto
 * só evita que ele reprove por diferença de forma.
 */

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Converte pra string sem inventar nada: número/booleano viram texto, o resto vira "". */
function comoTexto(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // Um campo de texto que veio como LISTA de pedaços ("conteudo": ["p1","p2"])
  // é mania comum de modelo, e devolver "" aqui apagava o bloco inteiro: ele
  // ficava sem conteúdo, era descartado, e a importação falhava com um erro
  // que não dizia nada sobre a causa. Emendar os pedaços não inventa nada —
  // o texto é o que a IA escreveu, na ordem em que escreveu.
  if (Array.isArray(v)) return v.map(comoTexto).filter(Boolean).join('\n')
  return ''
}

function comoLista(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (v === undefined || v === null) return []
  return [v]
}

/** Tira cercas de markdown (```json ... ```) que alguns modelos colocam mesmo em modo JSON. */
export function extrairJson(texto: string): string {
  const semCerca = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const inicio = semCerca.indexOf('{')
  const fim = semCerca.lastIndexOf('}')
  if (inicio !== -1 && fim > inicio) return semCerca.slice(inicio, fim + 1)
  return semCerca
}

const LETRAS = ['A', 'B', 'C', 'D', 'E']

/** Aceita alternativas como lista de objetos, lista de strings, ou objeto { A: "texto" }. */
function normalizarAlternativas(v: unknown): { id: string; texto: string }[] {
  if (Array.isArray(v)) {
    return v
      .map((alt, i) => {
        if (ehObjeto(alt)) {
          const id = comoTexto(alt.id ?? alt.letra ?? alt.chave).trim().toUpperCase().replace(/[^A-E]/g, '')
          return { id: id || LETRAS[i] || '', texto: comoTexto(alt.texto ?? alt.text ?? alt.conteudo).trim() }
        }
        // Lista de strings: a posição vira a letra.
        return { id: LETRAS[i] || '', texto: comoTexto(alt).trim() }
      })
      .filter((a) => a.id && a.texto)
  }
  if (ehObjeto(v)) {
    return Object.entries(v)
      .map(([chave, texto]) => ({ id: chave.trim().toUpperCase().replace(/[^A-E]/g, ''), texto: comoTexto(texto).trim() }))
      .filter((a) => a.id && a.texto)
  }
  return []
}

/** "a)", " B ", "Letra C" -> "A" / "B" / "C". Sem letra reconhecível, devolve "". */
function normalizarGabarito(v: unknown): string {
  const m = comoTexto(v).toUpperCase().match(/[A-E]/)
  return m ? m[0] : ''
}

/** altExp precisa ser um objeto de textos; qualquer outra forma vira {} em vez de reprovar a aula. */
function normalizarAltExp(v: unknown, idsValidos: string[]): Record<string, string> {
  if (!ehObjeto(v)) return {}
  const saida: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(v)) {
    const id = chave.trim().toUpperCase().replace(/[^A-E]/g, '')
    const texto = comoTexto(valor).trim()
    // Explicação vazia ou pra alternativa inexistente é descartada — o
    // validador de importação rejeitaria as duas coisas.
    if (id && texto && idsValidos.includes(id)) saida[id] = texto
  }
  return saida
}

function normalizarQuestao(q: unknown, temaPadrao: string): Record<string, unknown> | null {
  if (!ehObjeto(q)) return null
  const enunciado = comoTexto(q.enunciado ?? q.pergunta ?? q.texto).trim()
  const alternativas = normalizarAlternativas(q.alternativas ?? q.opcoes ?? q.options)
  // Sem enunciado ou sem alternativas suficientes não é questão — descarta em
  // vez de derrubar a aula inteira por causa de uma entrada quebrada.
  if (!enunciado || alternativas.length < 2) return null

  const ids = alternativas.map((a) => a.id)
  const gabarito = normalizarGabarito(q.gabarito ?? q.resposta)
  return {
    // `tema` é o único campo de questão que o validador final de importação
    // exige não-vazio — e é ele que alimenta o filtro por assunto na tela de
    // Questões. Quando a IA não informa, o título da aula é o rótulo
    // honesto: é literalmente o assunto daquele trecho.
    tema: comoTexto(q.tema).trim() || temaPadrao,
    banca: comoTexto(q.banca).trim(),
    ano: comoTexto(q.ano).trim(),
    orgao: comoTexto(q.orgao ?? q.órgão).trim(),
    enunciado,
    alternativas: alternativas.slice(0, 5),
    // Gabarito precisa apontar pra uma alternativa que existe; se não
    // apontar, cai na primeira — o conteúdo da questão continua útil.
    gabarito: ids.includes(gabarito) ? gabarito : ids[0],
    explicacao: comoTexto(q.explicacao ?? q.comentario).trim(),
    altExp: normalizarAltExp(q.altExp ?? q.explicacoesAlternativas, ids),
  }
}

/**
 * Os oito tipos que o schema aceita. Qualquer outro vira "texto".
 *
 * Isso importa porque o tipo é só a APARÊNCIA do bloco (a cor da caixa, o
 * ícone) — o conteúdo é o que vale. Quando a IA inventa um tipo que não
 * existe ("conceito", "introducao", "resumo"), rejeitar o bloco jogava fora
 * um parágrafo perfeitamente bom, e um único bloco assim derrubava a aula
 * inteira. Mostrar como texto comum é a degradação honesta: o usuário lê o
 * mesmo conteúdo, só sem o destaque visual.
 */
const TIPOS_CONHECIDOS = ['texto', 'dica', 'alerta', 'memorize', 'exemplo', 'palavra', 'naoconfunda', 'tabela']

/** Tira tags de HTML preservando o texto — alguns modelos devolvem "html" em vez de "conteudo". */
function textoDeHtml(v: unknown): string {
  return comoTexto(v)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Um bloco da IA vira ZERO, UM ou DOIS blocos do nosso formato.
 *
 * Dois quando o bloco traz uma tabela que o próprio tipo não sabe desenhar:
 * só `tabela` e `naoconfunda` desenham tabela em `lessonCompiler`. Antes, uma
 * tabela dentro de um "memorize" simplesmente sumia na compilação — e quando
 * ela era o ÚNICO conteúdo do bloco, o bloco virava "texto" vazio e derrubava
 * a importação inteira. Agora a tabela sai como bloco próprio, logo depois.
 */
function normalizarBloco(b: unknown): Record<string, unknown>[] {
  if (!ehObjeto(b)) return []
  // "Não Confunda", "nao-confunda", "NAOCONFUNDA" -> "naoconfunda"
  const tipoBruto = comoTexto(b.tipo)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
  const tipo = TIPOS_CONHECIDOS.includes(tipoBruto) ? tipoBruto : 'texto'

  const subtopicos = comoLista(b.subtopicos)
    .map((s) =>
      ehObjeto(s) ? { titulo: comoTexto(s.titulo).trim(), conteudo: comoTexto(s.conteudo).trim() } : null,
    )
    .filter((s): s is { titulo: string; conteudo: string } => !!s && !!s.titulo && !!s.conteudo)

  const bloco: Record<string, unknown> = { tipo }
  const titulo = comoTexto(b.titulo).trim()
  const conteudo = comoTexto(b.conteudo ?? b.texto).trim() || textoDeHtml(b.html)
  if (titulo) bloco.titulo = titulo
  if (conteudo) bloco.conteudo = conteudo
  if (subtopicos.length) bloco.subtopicos = subtopicos

  const itens = comoLista(b.itens).map(comoTexto).map((s) => s.trim()).filter(Boolean)
  if (itens.length) bloco.itens = itens

  const colunas = comoLista(b.colunas).map(comoTexto).map((s) => s.trim()).filter(Boolean)
  const linhas = comoLista(b.linhas)
    .map((l) => comoLista(l).map(comoTexto))
    // Linha com quantidade de células diferente do cabeçalho quebraria a
    // tabela; ajusta o tamanho em vez de descartar a aula.
    .map((l) => (colunas.length ? [...l, ...Array(Math.max(0, colunas.length - l.length)).fill('')].slice(0, colunas.length) : l))
    .filter((l) => l.length > 0)
  const temTabela = !!(colunas.length && linhas.length)
  // A tabela fica no próprio bloco só se o tipo souber desenhá-la; senão sai
  // separada, no fim, pra não ser perdida na compilação.
  const tabelaNoBloco = temTabela && (tipo === 'tabela' || tipo === 'naoconfunda')
  if (tabelaNoBloco) {
    bloco.colunas = colunas
    bloco.linhas = linhas
  }
  const blocoTabela = temTabela && !tabelaNoBloco ? { tipo: 'tabela', colunas, linhas } : null

  // Espelha exatamente a regra do schema (`BlocoIntermediateSchema.refine`):
  // um bloco que não satisfaz o próprio tipo reprova a aula INTEIRA lá na
  // frente.
  const serveNoTipo =
    tipo === 'tabela'
      ? temTabela
      : tipo === 'texto'
        ? !!(titulo || conteudo || subtopicos.length)
        : tipo === 'naoconfunda'
          ? !!(conteudo || itens.length || temTabela)
          : !!(conteudo || itens.length)

  if (!serveNoTipo) {
    // REBAIXA em vez de descartar, quando ainda há o que mostrar.
    //
    // Isto aconteceu de verdade: a IA passou a devolver blocos tipados só com
    // título ({"tipo":"dica","titulo":"Dica de prova"}), sem conteúdo. Cada um
    // reprovava, o normalizador descartava todos, a aula ficava sem bloco
    // nenhum e a importação falhava inteira — em qualquer PDF.
    //
    // Um bloco "dica" sem texto não pode ser uma caixa de dica, mas um título
    // ainda é informação: vira "texto", que aceita título sozinho. É a mesma
    // degradação honesta já aplicada a tipos desconhecidos — perde-se a cor
    // da caixa, não o conteúdo.
    // Sem nada além da tabela, o bloco tipado não sobra: a tabela já vai
    // sair sozinha logo abaixo. Rebaixar pra "texto" aqui era o bug — "texto"
    // não aceita tabela, então o bloco vazio reprovava a aula inteira.
    if (!titulo && !conteudo && !subtopicos.length && !itens.length) {
      return blocoTabela ? [blocoTabela] : []
    }
    bloco.tipo = 'texto'
    if (itens.length && !conteudo) {
      // Itens num tipo que não os aceita viram uma lista em texto, senão
      // sumiriam junto com o tipo original.
      bloco.conteudo = itens.map((i) => `• ${i}`).join('\n')
      delete bloco.itens
    }
  }

  return blocoTabela ? [bloco, blocoTabela] : [bloco]
}

function normalizarAula(a: unknown): Record<string, unknown> | null {
  if (!ehObjeto(a)) return null
  const blocos = comoLista(a.blocos ?? a.conteudo).flatMap(normalizarBloco)
  const temQuestoes = comoLista(a.questoes ?? a.questions).length > 0
  // Aula sem bloco nenhum ainda vale se tiver questões: um PDF que é só banco
  // de questões não tem teoria pra extrair, e recusá-lo seria recusar
  // conteúdo perfeitamente útil.
  if (!blocos.length && !temQuestoes) return null
  const titulo = comoTexto(a.titulo ?? a.nome).trim() || 'Aula'
  return {
    titulo,
    blocos,
    questoes: comoLista(a.questoes ?? a.questions)
      .map((q) => normalizarQuestao(q, titulo))
      .filter(Boolean),
  }
}

/**
 * Ponto de entrada. Recebe o objeto já parseado do JSON da IA e devolve algo
 * no formato que `AulaGeradaIntermediateSchema` espera — ou o valor original
 * se nem der pra tentar (aí o schema reprova e o fluxo de reparo age).
 *
 * `materiaPadrao` só é usada quando a IA não informou a matéria; quando o
 * usuário escolhe a matéria de destino na tela, ela é sobrescrita depois de
 * qualquer jeito.
 */
export function normalizarSaidaIA(bruto: unknown, materiaPadrao = ''): unknown {
  if (!ehObjeto(bruto)) return bruto

  // A IA às vezes devolve UMA aula só, e aí escolhe entre três formas:
  // direto na raiz (sem invólucro), dentro de "aula" no singular, ou dentro
  // de "aulas" como o contrato pede. As três significam a mesma coisa.
  const cru =
    bruto.aulas === undefined && ehObjeto(bruto.aula)
      ? { ...bruto, aulas: [bruto.aula] }
      : bruto.aulas === undefined && (bruto.blocos !== undefined || bruto.titulo !== undefined)
        ? { aulas: [bruto] }
        : bruto

  const aulas = comoLista(cru.aulas).map(normalizarAula).filter(Boolean)

  // Mesmo sem nenhuma aula aproveitável, devolve a FORMA certa em vez do
  // objeto bruto. Devolvendo o bruto, o schema reprovava o JSON original e a
  // mensagem que chegava na tela apontava um bloco qualquer ("blocos.0: bloco
  // sem conteúdo suficiente") — um sintoma, não a causa. Com a forma certa, o
  // erro diz o que de fato aconteceu, e o reparo automático recebe uma
  // instrução que dá pra cumprir.
  return {
    materia: comoTexto(cru.materia ?? cru.disciplina).trim() || materiaPadrao.trim() || 'Geral',
    aulas,
  }
}
