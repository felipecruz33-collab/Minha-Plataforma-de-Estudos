-- Cronograma de estudos (um por usuário — geração automática ou manual, por semanas).

create table if not exists public.cronogramas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade unique,
  nome text not null,
  modo text not null check (modo in ('automatico','manual')),
  data_inicio date not null,
  data_fim date not null,
  materias jsonb not null default '[]'::jsonb,
  semanas jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.cronogramas enable row level security;

-- cronogramas: cada usuário só vê/grava/exclui o próprio
create policy "cronogramas: acesso próprio" on public.cronogramas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
