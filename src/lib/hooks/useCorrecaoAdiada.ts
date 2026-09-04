import { useCallback, useEffect, useState } from 'react'

/**
 * Correção adiada: marcar agora, corrigir depois — e poder mudar de ideia no
 * meio.
 *
 * Quem faz uma bateria de 50 questões não quer o gabarito da primeira antes de
 * ler a segunda: o gabarito muda a forma de ler o que vem depois. Então, com o
 * modo ligado, marcar uma alternativa NÃO grava nada. Fica um rascunho, e a
 * pessoa pode trocar quantas vezes quiser até mandar corrigir.
 *
 * Não gravar na hora é a parte que importa, e não é preguiça de escrever no
 * banco: enquanto o gabarito não apareceu, a pessoa não recebeu nenhuma
 * informação nova, então a marca anterior nunca foi uma tentativa — era um
 * palpite em aberto. Se ela virasse resposta gravada, uma questão que a pessoa
 * repensou e corrigiu sozinha já teria entrado no ciclo de revisão como erro,
 * e o Desempenho contaria duas tentativas onde houve uma. A tentativa nasce no
 * momento em que a correção é pedida — que é exatamente o momento em que a
 * pessoa se compromete com a resposta.
 *
 * Mora no navegador, não no perfil, por dois motivos: é preferência e rascunho
 * de estudo, não dado da conta; e assim uma bateria inteira custa uma escrita
 * no banco em vez de cinquenta.
 */

const CHAVE_MODO = 'mpe:correcao-adiada'
const CHAVE_RASCUNHOS = 'mpe:correcao-rascunhos'
/** Versão anterior guardava só ids de questões já gravadas. Não serve mais. */
const CHAVE_ANTIGA = 'mpe:correcao-pendentes'

export interface RascunhoResposta {
  questaoId: string
  aulaId: string
  materiaId: string
  alternativaEscolhida: string
  /**
   * Quando a pessoa marcou.
   *
   * A resposta conta no dia em que foi DADA, não no dia em que foi corrigida:
   * quem marca trinta questões à noite e manda corrigir de manhã não pode ver
   * o estudo de ontem aparecer como se fosse de hoje no extrato e no caderno
   * do mês.
   */
  marcadoEm: string
}

function ler<T>(chave: string, padrao: T): T {
  try {
    const cru = localStorage.getItem(chave)
    return cru ? (JSON.parse(cru) as T) : padrao
  } catch {
    // Navegador com armazenamento bloqueado, aba anônima, cota estourada: a
    // preferência se perde, mas a tela continua funcionando no modo normal.
    return padrao
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    /* idem: perder a preferência é aceitável, quebrar a tela não */
  }
}

export function useCorrecaoAdiada(userId: string | undefined) {
  const chaveModo = `${CHAVE_MODO}:${userId ?? 'anon'}`
  const chaveRascunhos = `${CHAVE_RASCUNHOS}:${userId ?? 'anon'}`

  const [adiada, setAdiadaInterno] = useState(false)
  const [rascunhos, setRascunhos] = useState<Map<string, RascunhoResposta>>(new Map())
  /**
   * O que saiu da fila AGORA, nesta visita à tela.
   *
   * Sem isto, mandar corrigir esvaziaria a fila e a lista "só as que faltam
   * corrigir" ficaria vazia no mesmo instante — a pessoa pediria a correção e
   * as questões sumiriam antes de ela ler um comentário sequer. Pedir correção
   * tem que ENTREGAR a correção, não fechar a lista.
   *
   * Fica só na memória, de propósito: é o rastro de uma sessão de estudo, não
   * um dado da conta. Recarregar a página começa do zero, que é o esperado.
   */
  const [reveladasAgora, setReveladasAgora] = useState<Set<string>>(new Set())

  // Carrega quando o usuário fica conhecido. Sem isso o rascunho de uma conta
  // apareceria na sessão da outra no mesmo navegador.
  useEffect(() => {
    setAdiadaInterno(ler(chaveModo, false))
    setRascunhos(new Map(ler<RascunhoResposta[]>(chaveRascunhos, []).map((r) => [r.questaoId, r])))
    setReveladasAgora(new Set())
    // A chave antiga guardava ids de respostas JÁ gravadas esperando revelação.
    // Aquelas respostas continuam no banco e agora aparecem corrigidas, que é o
    // certo — o que não pode é o lixo ficar ocupando espaço para sempre.
    try {
      localStorage.removeItem(`${CHAVE_ANTIGA}:${userId ?? 'anon'}`)
    } catch {
      /* armazenamento bloqueado: não há o que limpar */
    }
  }, [chaveModo, chaveRascunhos, userId])

  const salvar = useCallback(
    (novo: Map<string, RascunhoResposta>) => {
      setRascunhos(novo)
      gravar(chaveRascunhos, [...novo.values()])
    },
    [chaveRascunhos],
  )

  const setAdiada = useCallback(
    (valor: boolean) => {
      setAdiadaInterno(valor)
      gravar(chaveModo, valor)
    },
    [chaveModo],
  )

  /**
   * Marca — ou TROCA — a alternativa escolhida, sem gravar.
   *
   * Trocar é a operação normal aqui, não a exceção: é para isso que o rascunho
   * existe. Marcar de novo na mesma questão simplesmente substitui.
   */
  const marcarRascunho = useCallback(
    (rascunho: RascunhoResposta) => {
      setReveladasAgora((atual) => {
        if (!atual.has(rascunho.questaoId)) return atual
        const novo = new Set(atual)
        novo.delete(rascunho.questaoId)
        return novo
      })
      salvar(new Map(rascunhos).set(rascunho.questaoId, rascunho))
    },
    [rascunhos, salvar],
  )

  /** Depois de gravar de verdade: o rascunho cumpriu o papel e some. */
  const limparRascunhos = useCallback(() => salvar(new Map()), [salvar])

  /** Marca como "acabou de ser corrigida" para a questão não sumir da lista. */
  const marcarReveladas = useCallback(
    (questaoIds: string[]) => setReveladasAgora((atual) => new Set([...atual, ...questaoIds])),
    [],
  )

  /** Chamado quando a pessoa sai da lista de pendentes — o rastro cumpriu o papel. */
  const limparReveladas = useCallback(() => setReveladasAgora(new Set()), [])

  return {
    adiada,
    setAdiada,
    rascunhos,
    marcarRascunho,
    limparRascunhos,
    reveladasAgora,
    marcarReveladas,
    limparReveladas,
  }
}
