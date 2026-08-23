-- Camada extra de verificação de admin, no padrão recomendado pelo Supabase
-- (tabela de papéis separada + função has_role()), somada ao profiles.is_admin
-- que já existia. is_admin() passa a considerar as duas fontes — se qualquer
-- uma disser que a pessoa é admin, ela é admin.

create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "user_roles: usuário vê os próprios papéis" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

-- is_admin() (usada em todas as políticas de RLS desde 0002/0003) passa a
-- considerar profiles.is_admin OU user_roles — redefinir aqui não afeta as
-- políticas já criadas, elas chamam a função pelo nome.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false)
    or public.has_role(uid, 'admin')
$$;

-- Semeia o administrador (Seção 3) diretamente na nova tabela também.
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users where email = 'felipe.cruz33@gmail.com'
on conflict (user_id, role) do nothing;
