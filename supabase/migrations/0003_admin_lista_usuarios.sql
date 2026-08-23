-- Permite que o administrador veja a lista de todos os usuários cadastrados
-- (tela "Usuários", exclusiva do admin). Usuários comuns continuam só
-- enxergando o próprio perfil — política já existente em 0002.

create policy "profiles: admin vê todos os perfis" on public.profiles
  for select using (public.is_admin(auth.uid()));
