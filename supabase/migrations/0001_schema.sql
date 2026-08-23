-- Minha Plataforma de Estudos — schema inicial
-- Rode com: supabase db push  (ou cole no SQL editor do painel Supabase)

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  is_admin boolean not null default false,
  is_premium boolean not null default false,
  favoritos text[] not null default '{}',
  criado_em timestamptz not null default now()
);

create table if not exists public.materias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  nome text not null,
  is_biblioteca boolean not null default false,
  criado_em timestamptz not null default now(),
  constraint materia_dono check (
    (is_biblioteca = true and user_id is null) or
    (is_biblioteca = false and user_id is not null)
  )
);
create unique index if not exists materias_biblioteca_nome_uniq
  on public.materias (nome) where (is_biblioteca = true);
create unique index if not exists materias_usuario_nome_uniq
  on public.materias (user_id, nome) where (is_biblioteca = false);

create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references public.materias (id) on delete cascade,
  titulo text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists aulas_materia_titulo_uniq on public.aulas (materia_id, titulo);

create table if not exists public.blocos (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas (id) on delete cascade,
  tipo text not null check (tipo in ('texto','dica','alerta','memorize','exemplo','palavra','naoconfunda','tabela')),
  ordem integer not null check (ordem >= 0),
  html text not null
);
create unique index if not exists blocos_aula_ordem_uniq on public.blocos (aula_id, ordem);

create table if not exists public.questoes (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas (id) on delete cascade,
  materia_id uuid not null references public.materias (id) on delete cascade,
  tema text not null,
  banca text not null default '',
  ano text not null default '',
  orgao text not null default '',
  enunciado text not null,
  alternativas jsonb not null,
  gabarito text not null,
  explicacao text not null default '',
  alt_exp jsonb not null default '{}'::jsonb
);

create table if not exists public.respostas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  questao_id uuid not null references public.questoes (id) on delete cascade,
  aula_id uuid not null references public.aulas (id) on delete cascade,
  materia_id uuid not null references public.materias (id) on delete cascade,
  alternativa_escolhida text not null,
  correta boolean not null,
  respondido_em timestamptz not null default now()
);
create index if not exists respostas_user_idx on public.respostas (user_id);

create table if not exists public.geracoes_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome_arquivo text not null,
  materia text not null,
  aula_titulo text not null,
  status text not null check (status in ('concluido','erro')),
  mensagem text,
  criado_em timestamptz not null default now()
);
create index if not exists geracoes_user_idx on public.geracoes_ia (user_id);

-- Cria automaticamente um profile ao registrar um novo usuário.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
