-- Biblioteca aberta pra todo mundo por enquanto (fase de crescimento antes
-- da Play Store) — espelha o interruptor `BIBLIOTECA_ABERTA_PARA_TODOS` em
-- src/lib/premium.ts. Sem esta migração, mudar só o código do app não
-- libera nada de verdade: a RLS ainda bloquearia a leitura no banco.
--
-- Troca a condição de leitura da biblioteca de "premium ou admin" pra
-- "qualquer usuário autenticado", nas 4 tabelas que compõem uma aula
-- (materias, aulas, blocos, questoes). As policies de ESCRITA na
-- biblioteca continuam exclusivas de admin — só a leitura muda.
--
-- PRA REATIVAR O BLOQUEIO PREMIUM (antes de publicar na Play Store):
-- troque `BIBLIOTECA_ABERTA_PARA_TODOS` pra `false` em src/lib/premium.ts
-- E rode uma migração nova recriando estas 4 policies com
-- `public.is_premium_or_admin(auth.uid())` no lugar de `auth.uid() is not null`
-- (exatamente como elas estavam em 0002_rls_policies.sql).

drop policy if exists "materias: leitura da biblioteca (premium ou admin)" on public.materias;
create policy "materias: leitura da biblioteca (qualquer autenticado)" on public.materias
  for select using (is_biblioteca and auth.uid() is not null);

drop policy if exists "aulas: leitura da biblioteca" on public.aulas;
create policy "aulas: leitura da biblioteca" on public.aulas
  for select using (exists (
    select 1 from public.materias m
    where m.id = aulas.materia_id and m.is_biblioteca and auth.uid() is not null
  ));

drop policy if exists "blocos: leitura da biblioteca" on public.blocos;
create policy "blocos: leitura da biblioteca" on public.blocos
  for select using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and m.is_biblioteca and auth.uid() is not null
  ));

drop policy if exists "questoes: leitura da biblioteca" on public.questoes;
create policy "questoes: leitura da biblioteca" on public.questoes
  for select using (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and m.is_biblioteca and auth.uid() is not null
  ));
