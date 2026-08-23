-- Row Level Security — a Biblioteca compartilhada só pode ser escrita pelo
-- administrador, mesmo que alguém contorne a interface (Seção 3 / Seção 9).

alter table public.profiles enable row level security;
alter table public.materias enable row level security;
alter table public.aulas enable row level security;
alter table public.blocos enable row level security;
alter table public.questoes enable row level security;
alter table public.respostas enable row level security;
alter table public.geracoes_ia enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = uid), false)
$$;

create or replace function public.is_premium_or_admin(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_premium or is_admin from public.profiles where id = uid), false)
$$;

-- Impede que o próprio usuário altere is_admin/is_premium pelo cliente;
-- essas colunas só mudam via service_role (painel admin / webhook de assinatura).
create or replace function public.protect_profile_flags()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' then
    new.is_admin := old.is_admin;
    new.is_premium := old.is_premium;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_flags_trg on public.profiles;
create trigger protect_profile_flags_trg
  before update on public.profiles
  for each row execute procedure public.protect_profile_flags();

-- profiles
create policy "profiles: usuário vê o próprio perfil" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: usuário atualiza o próprio perfil" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- materias
create policy "materias: leitura própria" on public.materias
  for select using (not is_biblioteca and user_id = auth.uid());
create policy "materias: leitura da biblioteca (premium ou admin)" on public.materias
  for select using (is_biblioteca and public.is_premium_or_admin(auth.uid()));
create policy "materias: cria a própria" on public.materias
  for insert with check (not is_biblioteca and user_id = auth.uid());
create policy "materias: exclui a própria" on public.materias
  for delete using (not is_biblioteca and user_id = auth.uid());
create policy "materias: admin gerencia biblioteca" on public.materias
  for all using (is_biblioteca and public.is_admin(auth.uid()))
  with check (is_biblioteca and public.is_admin(auth.uid()));

-- aulas (herda a visibilidade/posse da matéria)
create policy "aulas: leitura própria" on public.aulas
  for select using (exists (
    select 1 from public.materias m
    where m.id = aulas.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "aulas: leitura da biblioteca" on public.aulas
  for select using (exists (
    select 1 from public.materias m
    where m.id = aulas.materia_id and m.is_biblioteca and public.is_premium_or_admin(auth.uid())
  ));
create policy "aulas: escreve na própria matéria" on public.aulas
  for all using (exists (
    select 1 from public.materias m
    where m.id = aulas.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.materias m
    where m.id = aulas.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "aulas: admin gerencia biblioteca" on public.aulas
  for all using (exists (
    select 1 from public.materias m where m.id = aulas.materia_id and m.is_biblioteca
  ) and public.is_admin(auth.uid()))
  with check (exists (
    select 1 from public.materias m where m.id = aulas.materia_id and m.is_biblioteca
  ) and public.is_admin(auth.uid()));

-- blocos (mesma regra da aula-mãe)
create policy "blocos: leitura própria" on public.blocos
  for select using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "blocos: leitura da biblioteca" on public.blocos
  for select using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and m.is_biblioteca and public.is_premium_or_admin(auth.uid())
  ));
create policy "blocos: escreve na própria aula" on public.blocos
  for all using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and not m.is_biblioteca and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "blocos: admin gerencia biblioteca" on public.blocos
  for all using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and m.is_biblioteca
  ) and public.is_admin(auth.uid()))
  with check (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and m.is_biblioteca
  ) and public.is_admin(auth.uid()));

-- questoes (mesma regra da matéria)
create policy "questoes: leitura própria" on public.questoes
  for select using (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "questoes: leitura da biblioteca" on public.questoes
  for select using (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and m.is_biblioteca and public.is_premium_or_admin(auth.uid())
  ));
create policy "questoes: escreve na própria matéria" on public.questoes
  for all using (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "questoes: admin gerencia biblioteca" on public.questoes
  for all using (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and m.is_biblioteca
  ) and public.is_admin(auth.uid()))
  with check (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and m.is_biblioteca
  ) and public.is_admin(auth.uid()));

-- respostas: cada usuário só vê/grava as próprias
create policy "respostas: acesso próprio" on public.respostas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- geracoes_ia: cada usuário só vê/grava as próprias
create policy "geracoes_ia: acesso próprio" on public.geracoes_ia
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
