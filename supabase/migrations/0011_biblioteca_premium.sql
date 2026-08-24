-- Reativa o bloqueio Premium na Biblioteca compartilhada.
--
-- Desfaz a 0009_biblioteca_aberta.sql, voltando as 4 policies de leitura ao
-- que eram na 0002_rls_policies.sql: `is_premium_or_admin(auth.uid())` no
-- lugar de `auth.uid() is not null`.
--
-- Esta migração é a metade que vale de verdade. Mudar só
-- BIBLIOTECA_ABERTA_PARA_TODOS em src/lib/premium.ts esconde a tela, mas o
-- banco continuaria entregando os dados pra quem pedisse direto na API.
--
-- As policies de ESCRITA continuam como sempre: exclusivas de admin.

drop policy if exists "materias: leitura da biblioteca (qualquer autenticado)" on public.materias;
drop policy if exists "materias: leitura da biblioteca (premium ou admin)" on public.materias;
create policy "materias: leitura da biblioteca (premium ou admin)" on public.materias
  for select using (is_biblioteca and public.is_premium_or_admin(auth.uid()));

drop policy if exists "aulas: leitura da biblioteca" on public.aulas;
create policy "aulas: leitura da biblioteca" on public.aulas
  for select using (exists (
    select 1 from public.materias m
    where m.id = aulas.materia_id and m.is_biblioteca and public.is_premium_or_admin(auth.uid())
  ));

drop policy if exists "blocos: leitura da biblioteca" on public.blocos;
create policy "blocos: leitura da biblioteca" on public.blocos
  for select using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and m.is_biblioteca and public.is_premium_or_admin(auth.uid())
  ));

drop policy if exists "questoes: leitura da biblioteca" on public.questoes;
create policy "questoes: leitura da biblioteca" on public.questoes
  for select using (exists (
    select 1 from public.materias m
    where m.id = questoes.materia_id and m.is_biblioteca and public.is_premium_or_admin(auth.uid())
  ));
