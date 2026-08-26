import { useEffect, useMemo, useRef, useState } from 'react'

/** Quantos itens entram de cada vez. */
export const POR_PAGINA = 20

/**
 * Mostra a lista aos poucos, em vez de jogar tudo na tela de uma vez.
 *
 * O motivo é medido, não teórico: com 1.800 questões, a tela de Questões
 * levava 2,2 segundos para aparecer enquanto todas as outras ficavam abaixo de
 * 250 ms. O tempo não era do banco — era o navegador montando 1.800 cartões,
 * cada um com quatro alternativas e a explicação. E ninguém lê 1.800 questões
 * de uma sentada: a lista inteira era construída para ser rolada por vinte.
 *
 * IMPORTANTE: `itens` precisa vir de um `useMemo`. O contador volta ao começo
 * quando a lista MUDA DE IDENTIDADE — é assim que filtrar não deixa a pessoa
 * vendo "mostrando 200 de 3". Se a lista for recriada a cada render, o
 * contador nunca sai da primeira página e o botão parece não funcionar.
 */
export function useListaVisivel<T>(itens: T[], porPagina = POR_PAGINA) {
  const [limite, setLimite] = useState(porPagina)
  const listaAnterior = useRef(itens)

  useEffect(() => {
    if (listaAnterior.current === itens) return
    listaAnterior.current = itens
    setLimite(porPagina)
  }, [itens, porPagina])

  // Enquanto o efeito não roda (ele acontece depois da pintura), `limite` ainda
  // é o da lista antiga. Cortar pelo menor dos dois evita o piscar de uma lista
  // longa aparecendo por um quadro logo depois de filtrar.
  const efetivo = listaAnterior.current === itens ? limite : porPagina
  const visiveis = useMemo(() => itens.slice(0, efetivo), [itens, efetivo])

  return {
    visiveis,
    total: itens.length,
    temMais: itens.length > efetivo,
    verMais: () => setLimite((l) => l + porPagina),
  }
}
