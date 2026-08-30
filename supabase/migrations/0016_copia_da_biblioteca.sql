-- Cópias da biblioteca ficam presas à assinatura.
--
-- A biblioteca curada é o diferencial da plataforma. Como qualquer pessoa
-- Premium pode copiar uma aula dela para a área pessoal, sem isto bastaria
-- assinar um mês, copiar tudo e cancelar.
--
-- COMO FUNCIONA
--
-- A aula copiada ganha uma marca (`da_biblioteca`). Sem Premium, o TÍTULO da
-- aula continua visível, mas o CONTEÚDO (blocos e questões) não é entregue.
--
-- Essa distinção é de propósito: se a aula sumisse por completo, a pessoa
-- veria conteúdo desaparecer sem explicação — indistinguível de perda de
-- dados, e o caminho mais curto para uma avaliação de uma estrela. Vendo o
-- título com um cadeado, ela entende o que houve e sabe como voltar. O título
-- sozinho não é o valor; o conteúdo é.
--
-- NÃO apaga nada: quem reassinar recupera tudo, inclusive o histórico de
-- respostas daquelas questões.

alter table public.aulas
  add column if not exists da_biblioteca boolean not null default false;

-- A marca só pode ser LIGADA pelo cliente, nunca desligada.
--
-- Sem isto, qualquer pessoa poderia mandar um update no próprio registro
-- zerando a marca e destravando o conteúdo — a política de escrita já permite
-- que ela altere as próprias aulas, e é assim que tem que ser.
create or replace function public.proteger_marca_biblioteca()
returns trigger
language plpgsql
as $$
begin
  if auth.role() <> 'service_role' and old.da_biblioteca and not new.da_biblioteca then
    new.da_biblioteca := old.da_biblioteca;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_marca_biblioteca_trg on public.aulas;
create trigger proteger_marca_biblioteca_trg
  before update on public.aulas
  for each row execute procedure public.proteger_marca_biblioteca();

-- ---------------------------------------------------------------------------
-- Leitura do CONTEÚDO: bloqueada para cópia da biblioteca sem Premium.
-- A aula em si (o título) continua legível — ver a explicação acima.
-- ---------------------------------------------------------------------------

drop policy if exists "blocos: leitura própria" on public.blocos;
create policy "blocos: leitura própria" on public.blocos
  for select using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id
      and not m.is_biblioteca
      and m.user_id = auth.uid()
      and (not a.da_biblioteca or public.is_premium_or_admin(auth.uid()))
  ));

-- As questões passam a ser conferidas pela AULA, e não só pela matéria: é na
-- aula que mora a marca. O índice questoes_aula_idx (migração 0015) é o que
-- mantém isso barato.
drop policy if exists "questoes: leitura própria" on public.questoes;
create policy "questoes: leitura própria" on public.questoes
  for select using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = questoes.aula_id
      and not m.is_biblioteca
      and m.user_id = auth.uid()
      and (not a.da_biblioteca or public.is_premium_or_admin(auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- Separar ESCRITA de LEITURA.
--
-- As políticas de escrita de 0002 são `for all` — e `for all` inclui SELECT.
-- Como no PostgreSQL as políticas permissivas se somam (basta UMA liberar), a
-- política de escrita entregava o conteúdo por trás e o bloqueio acima não
-- valia nada. Descoberto testando: sem isto, o recurso inteiro seria fachada.
--
-- Aqui elas viram três políticas explícitas de insert/update/delete, com
-- exatamente as mesmas condições de antes. Ninguém perde permissão de escrita;
-- o que se perde é o efeito colateral de leitura, que nunca foi intencional.
-- ---------------------------------------------------------------------------

drop policy if exists "blocos: escreve na própria aula" on public.blocos;
create policy "blocos: insere na própria aula" on public.blocos
  for insert with check (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "blocos: altera na própria aula" on public.blocos
  for update using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and not m.is_biblioteca and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "blocos: apaga na própria aula" on public.blocos
  for delete using (exists (
    select 1 from public.aulas a join public.materias m on m.id = a.materia_id
    where a.id = blocos.aula_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));

drop policy if exists "questoes: escreve na própria matéria" on public.questoes;
create policy "questoes: insere na própria matéria" on public.questoes
  for insert with check (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "questoes: altera na própria matéria" on public.questoes
  for update using (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));
create policy "questoes: apaga na própria matéria" on public.questoes
  for delete using (exists (
    select 1 from public.materias m where m.id = questoes.materia_id and not m.is_biblioteca and m.user_id = auth.uid()
  ));

create index if not exists aulas_da_biblioteca_idx on public.aulas (da_biblioteca) where da_biblioteca;
