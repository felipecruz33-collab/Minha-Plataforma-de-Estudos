import { useEffect, useMemo, useState } from 'react'

/** Quantas questões cabem numa página. */
export const POR_PAGINA = 20

/**
 * Lista em páginas numeradas.
 *
 * Substitui o "carregar mais" onde a lista é longa E interativa ao mesmo
 * tempo. O problema do carregar mais não era o botão: era o contador voltar ao
 * começo sempre que a lista mudava de identidade. Isso é o certo quando a
 * pessoa filtra — ninguém quer ver "mostrando 200 de 3" —, mas na tela de
 * Questões a lista também é recalculada quando alguém RESPONDE (a fila de
 * correção adiada entra no filtro). Resultado: carregava 60 questões, marcava
 * uma alternativa, e a lista se fechava de volta nas 20 primeiras.
 *
 * Aqui o número da página não tem nada a ver com a identidade da lista. Ele só
 * volta para 1 quando a `chave` muda — e a chave é a BUSCA (filtros, texto
 * digitado), não o conteúdo. Responder uma questão não é uma busca nova.
 *
 * `itens` continua precisando vir de um `useMemo`, agora só para não recortar
 * a fatia a cada render.
 */
export function usePaginacao<T>(itens: T[], chave: string, porPagina = POR_PAGINA) {
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    setPagina(1)
  }, [chave])

  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina))
  // A lista pode encolher embaixo da pessoa (questão excluída, resposta
  // esquecida) e deixar a página atual além do fim. Prender aqui, no valor
  // derivado, evita um render com a lista vazia antes de qualquer correção.
  const atual = Math.min(pagina, totalPaginas)

  const visiveis = useMemo(
    () => itens.slice((atual - 1) * porPagina, atual * porPagina),
    [itens, atual, porPagina],
  )

  return {
    pagina: atual,
    totalPaginas,
    visiveis,
    total: itens.length,
    /** Posição do primeiro e do último item desta página, para o "21–40 de 340". */
    de: itens.length === 0 ? 0 : (atual - 1) * porPagina + 1,
    ate: Math.min(atual * porPagina, itens.length),
    irPara: (p: number) => setPagina(Math.min(Math.max(1, p), totalPaginas)),
  }
}
