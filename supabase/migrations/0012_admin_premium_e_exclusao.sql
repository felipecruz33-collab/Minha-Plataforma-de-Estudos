-- Painel do administrador: conceder/remover Premium e excluir uma conta.
--
-- Serve pra fase atual (o Felipe libera Premium na mão) e continua servindo
-- depois que a assinatura da Play Store existir: o webhook de pagamento vai
-- mexer na MESMA coluna, e o admin segue podendo conceder cortesia ou
-- resolver um caso problemático sem depender do fluxo de cobrança.

-- 1) is_premium passa a ser alterável pelo admin -----------------------------
--
-- O gatilho antigo devolvia is_admin E is_premium ao valor anterior pra
-- qualquer um que não fosse service_role -- e era por isso que o app não
-- conseguia dar Premium a ninguém pela interface.
--
-- is_admin continua trancado de propósito, mesmo para administradores: se um
-- admin pudesse promover outro pela interface, bastaria uma conta de admin
-- comprometida pra criar outras e o dono perder o controle. Promover admin
-- continua sendo feito só no painel do Supabase.
create or replace function public.protect_profile_flags()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- is_admin: nunca muda pelo cliente, nem para o próprio admin.
  new.is_admin := old.is_admin;

  -- is_premium: admin pode mudar (de qualquer perfil, inclusive o próprio);
  -- qualquer outro usuário fica com o valor que já estava.
  if not public.is_admin(auth.uid()) then
    new.is_premium := old.is_premium;
  end if;

  return new;
end;
$$;

-- O admin também precisa de permissão de UPDATE na linha dos outros; a policy
-- existente ("usuário atualiza o próprio perfil") só cobre a própria.
drop policy if exists "profiles: admin atualiza perfis" on public.profiles;
create policy "profiles: admin atualiza perfis" on public.profiles
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 2) Excluir uma conta por completo -----------------------------------------
--
-- Apagar só a linha de public.profiles deixaria a credencial de login viva em
-- auth.users: a pessoa continuaria entrando, só que sem perfil -- pior que
-- não excluir. Como todas as tabelas do app referenciam auth.users com
-- `on delete cascade`, apagar de lá remove a conta e todo o conteúdo dela de
-- uma vez.
--
-- Escrever em auth.users exige privilégio que o cliente não tem, daí
-- `security definer`. As duas travas ficam DENTRO da função, então valem
-- mesmo que alguém chame a RPC direto, sem passar pela tela:
--   - quem chama precisa ser admin;
--   - ninguém exclui a própria conta (evita o dono se trancar pra fora).
create or replace function public.admin_excluir_usuario(alvo uuid)
returns void
language plpgsql
security definer set search_path = public, auth
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Apenas o administrador pode excluir contas.';
  end if;
  if alvo = auth.uid() then
    raise exception 'Você não pode excluir a sua própria conta por aqui.';
  end if;
  delete from auth.users where id = alvo;
end;
$$;

revoke all on function public.admin_excluir_usuario(uuid) from public;
grant execute on function public.admin_excluir_usuario(uuid) to authenticated;
