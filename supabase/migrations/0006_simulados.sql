-- Histórico de simulados (nome, configuração por matéria, cronômetro e resultado).

create table if not exists public.simulados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nome text not null,
  materias jsonb not null,
  tempo_limite_segundos integer,
  duracao_segundos integer not null default 0,
  total_questoes integer not null default 0,
  acertos integer not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists simulados_user_idx on public.simulados (user_id);

alter table public.simulados enable row level security;

-- simulados: cada usuário só vê/grava/exclui os próprios
create policy "simulados: acesso próprio" on public.simulados
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
