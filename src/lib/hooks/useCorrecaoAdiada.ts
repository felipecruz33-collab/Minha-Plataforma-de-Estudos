import { useCallback, useEffect, useState } from 'react'

/**
 * Correção adiada: responder agora, ver o resultado depois.
 *
 * Quem faz uma bateria de 50 questões não quer o gabarito da primeira antes de
 * ler a segunda — o gabarito muda a forma de ler o que vem depois. Então a
 * resposta é GRAVADA na hora (estatística, ciclo de revisão e desempenho
 * seguem certos, e sair da tela no meio não perde nada) e o que fica adiado é
 * só a revelação.
 *
 * Mora no navegador, não no perfil, por dois motivos: é preferência de estudo,
 * não dado da conta; e assim não exige migração nem uma ida ao banco a cada
 * questão respondida — numa bateria de 50, seriam 50 escritas só pra lembrar o
 * que já está na tela.
 */

const CHAVE_MODO = 'mpe:correcao-adiada'
const CHAVE_PENDENTES = 'mpe:correcao-pendentes'

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
  const chavePendentes = `${CHAVE_PENDENTES}:${userId ?? 'anon'}`

  const [adiada, setAdiadaInterno] = useState(false)
  const [pendentes, setPendentes] = useState<Set<string>>(new Set())
  /**
   * O que saiu da fila AGORA, nesta visita à tela.
   *
   * Sem isto, mandar corrigir esvaziava a fila e a lista "só as que faltam
   * corrigir" ficava vazia no mesmo instante — a pessoa pedia a correção e as
   * questões sumiam antes de ela conseguir ler um comentário sequer. Pedir
   * correção tem que ENTREGAR a correção, não fechar a lista.
   *
   * Fica só na memória, de propósito: é o rastro de uma sessão de estudo, não
   * um dado da conta. Recarregar a página começa do zero, que é o esperado.
   */
  const [reveladasAgora, setReveladasAgora] = useState<Set<string>>(new Set())

  // Carrega quando o usuário fica conhecido. Sem isso a preferência de uma
  // conta apareceria na sessão da outra no mesmo navegador.
  useEffect(() => {
    setAdiadaInterno(ler(chaveModo, false))
    setPendentes(new Set(ler<string[]>(chavePendentes, [])))
  }, [chaveModo, chavePendentes])

  const salvarPendentes = useCallback(
    (novo: Set<string>) => {
      setPendentes(novo)
      gravar(chavePendentes, [...novo])
    },
    [chavePendentes],
  )

  const setAdiada = useCallback(
    (valor: boolean) => {
      setAdiadaInterno(valor)
      gravar(chaveModo, valor)
      // Desligar o modo revela o que estava pendente: seria estranho pedir
      // correção na hora e continuar com dez respostas escondidas.
      if (!valor) {
        setReveladasAgora((atual) => new Set([...atual, ...pendentes]))
        salvarPendentes(new Set())
      }
    },
    [chaveModo, pendentes, salvarPendentes],
  )

  /** Chamado quando a pessoa responde com o modo adiado ligado. */
  const marcarPendente = useCallback(
    (questaoId: string) => {
      setReveladasAgora((atual) => {
        if (!atual.has(questaoId)) return atual
        const novo = new Set(atual)
        novo.delete(questaoId)
        return novo
      })
      salvarPendentes(new Set(pendentes).add(questaoId))
    },
    [pendentes, salvarPendentes],
  )

  const revelarTodas = useCallback(() => {
    setReveladasAgora((atual) => new Set([...atual, ...pendentes]))
    salvarPendentes(new Set())
  }, [pendentes, salvarPendentes])

  const revelar = useCallback(
    (questaoId: string) => {
      setReveladasAgora((atual) => new Set(atual).add(questaoId))
      const novo = new Set(pendentes)
      novo.delete(questaoId)
      salvarPendentes(novo)
    },
    [pendentes, salvarPendentes],
  )

  /** Chamado quando a pessoa sai da lista de pendentes — o rastro cumpriu o papel. */
  const limparReveladas = useCallback(() => setReveladasAgora(new Set()), [])

  return {
    adiada,
    setAdiada,
    pendentes,
    reveladasAgora,
    marcarPendente,
    revelar,
    revelarTodas,
    limparReveladas,
  }
}
