/**
 * Recuperação de senha.
 *
 * ## Por que é um link, e não a senha por e-mail
 *
 * A senha não é guardada em lugar nenhum de onde dê pra lê-la: o Supabase
 * guarda só um resumo criptográfico dela, que serve pra conferir se a senha
 * digitada bate, mas não permite refazer a original. Nem o dono do app
 * consegue. Isso é proposital: se um banco vazar, as senhas não vazam junto.
 *
 * Então o caminho é o mesmo de qualquer banco ou loja: mandamos um link que
 * abre uma tela pra pessoa ESCREVER uma senha nova. O link vale por pouco
 * tempo e por um uso só.
 */

/**
 * Se a tela deve dizer "este e-mail não está cadastrado".
 *
 * Ligado porque foi pedido, e porque o ganho é real: quem erra a digitação
 * descobre na hora, em vez de ficar esperando um e-mail que nunca chega.
 *
 * O custo é que alguém pode testar endereços em lote pra descobrir quem usa o
 * app (o nome disso é enumeração de contas). Num app de estudos isso é pouco
 * sensível — mas é uma escolha, e virar isto pra `false` desfaz: a tela passa
 * a responder a mesma coisa para todos os casos, sem revelar nada.
 */
export const AVISAR_EMAIL_NAO_CADASTRADO = true

/** Caminho da tela que o link do e-mail abre. Precisa estar liberado no Supabase (ver README). */
export const CAMINHO_NOVA_SENHA = '/nova-senha'

export function urlDeRetornoNovaSenha(): string {
  return `${window.location.origin}${CAMINHO_NOVA_SENHA}`
}

export type ResultadoEnvio =
  | { tipo: 'enviado' }
  | { tipo: 'nao-cadastrado' }
  | { tipo: 'indisponivel' }
  | { tipo: 'erro'; mensagem: string }
