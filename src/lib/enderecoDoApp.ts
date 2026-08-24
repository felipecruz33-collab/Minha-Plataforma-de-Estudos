/**
 * Detecta se o app está aberto num endereço de IMPLANTAÇÃO da Vercel, e não no
 * endereço oficial.
 *
 * Por que isso importa: cada publicação na Vercel ganha um endereço próprio,
 * com um código no meio — algo como
 * `meu-app-ghv0vwdw1.vercel.app`. Esse endereço aponta pra AQUELA publicação
 * específica, para sempre. Quem salvar ou instalar o app por ele fica
 * congelado naquela versão: fechar e abrir não adianta, procurar atualização
 * não adianta, limpar o cache não adianta — o servidor está entregando
 * exatamente o que foi publicado naquele dia, e continuará entregando.
 *
 * É uma armadilha silenciosa: o endereço com código é justamente o que a
 * Vercel mostra em destaque logo depois de publicar, então é fácil abrir ele
 * no celular e nunca mais sair dali.
 *
 * A checagem é uma heurística, não uma certeza — por isso a tela sempre mostra
 * o endereço atual junto, pra pessoa julgar por si.
 */
export function pareceEnderecoDePublicacao(host: string): boolean {
  if (!host.endsWith('.vercel.app')) return false

  const subdominio = host.slice(0, -'.vercel.app'.length)
  // O código de publicação é um trecho comprido que mistura letras e números.
  // Nomes de projeto normais ("minha", "plataforma", "estudos") não misturam.
  return subdominio
    .split('-')
    .some((parte) => parte.length >= 8 && /[a-z]/.test(parte) && /[0-9]/.test(parte))
}
