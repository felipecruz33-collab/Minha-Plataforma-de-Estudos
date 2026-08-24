-- Permite que a tela de "Esqueci minha senha" diga se o e-mail digitado tem
-- conta, em vez de responder sempre "enviamos" e deixar quem errou a digitação
-- esperando um e-mail que nunca vem.
--
-- PONDERAÇÃO DE SEGURANÇA (leia antes de manter isto):
-- uma função que responde "este e-mail tem conta?" permite que alguém descubra
-- quem usa o app, testando endereços em lote. É o que se chama de enumeração
-- de contas, e é por isso que o próprio Supabase responde "enviamos" mesmo
-- para e-mails inexistentes.
--
-- Para um app de estudos, saber que fulano tem conta aqui é pouco sensível, e
-- o ganho de usabilidade é concreto. Mas é uma escolha, não um descuido — e
-- ela pode ser desfeita sem tocar no banco: basta virar
-- AVISAR_EMAIL_NAO_CADASTRADO para false em src/lib/auth/recuperacaoSenha.ts,
-- que a tela volta a responder igual para todos os casos.
--
-- A função devolve SÓ um booleano: nunca lista e-mails, nem confirma nada
-- além do que foi perguntado.
create or replace function public.email_cadastrado(email_consultado text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where lower(email) = lower(trim(email_consultado))
  )
$$;

revoke all on function public.email_cadastrado(text) from public;
grant execute on function public.email_cadastrado(text) to anon, authenticated;
