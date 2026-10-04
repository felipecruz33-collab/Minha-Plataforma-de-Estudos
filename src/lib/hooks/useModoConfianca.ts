import { useCallback, useEffect, useState } from 'react'

/**
 * Modo confiança: dizer, ao responder, o quanto tinha certeza.
 *
 * Opcional e desligado por padrão — de propósito. Ele acrescenta um clique por
 * questão, e um clique a mais numa bateria de cinquenta é o tipo de atrito que
 * faz a pessoa parar de usar a tela. Quem liga, liga sabendo o que ganha:
 *
 * - acerto chutado para de subir degrau na escada de revisão (sorte não é
 *   memória, e o prazo não pode crescer por sorte);
 * - erro cometido COM certeza vai para a frente da fila, porque é o erro que
 *   mais rende corrigir (hipercorreção — Butterfield e Metcalfe, 2001, 2006);
 * - o Desempenho passa a mostrar calibração: o quanto a sua sensação de saber
 *   corresponde ao que você acerta de verdade.
 *
 * Mora no navegador porque é preferência de estudo, não dado da conta. E tem
 * aviso próprio em vez de `useState` solto porque a caixinha que liga o modo
 * vive numa tela e quem reage a ela é o cartão de questão: sem o aviso, ligar
 * a caixa não mudaria nenhum cartão já montado.
 */
const CHAVE = 'mpe:modo-confianca'
const AVISO = 'mpe:modo-confianca:mudou'

function ler(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === '1'
  } catch {
    // Armazenamento bloqueado (aba anônima, cota): o modo fica desligado, que
    // é o comportamento de sempre.
    return false
  }
}

export function useModoConfianca(userId?: string) {
  const chave = `${CHAVE}:${userId ?? 'anon'}`
  const [ativo, setAtivoInterno] = useState(false)

  useEffect(() => {
    setAtivoInterno(ler(chave))
    const atualizar = () => setAtivoInterno(ler(chave))
    window.addEventListener(AVISO, atualizar)
    // Outra aba aberta na mesma conta também precisa acompanhar.
    window.addEventListener('storage', atualizar)
    return () => {
      window.removeEventListener(AVISO, atualizar)
      window.removeEventListener('storage', atualizar)
    }
  }, [chave])

  const setAtivo = useCallback(
    (valor: boolean) => {
      setAtivoInterno(valor)
      try {
        localStorage.setItem(chave, valor ? '1' : '0')
      } catch {
        /* sem armazenamento a escolha vale só nesta sessão */
      }
      window.dispatchEvent(new Event(AVISO))
    },
    [chave],
  )

  return { ativo, setAtivo }
}
