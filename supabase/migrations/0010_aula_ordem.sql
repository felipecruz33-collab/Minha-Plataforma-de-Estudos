-- Ordem manual das aulas dentro de cada matéria (MateriaDetail → "Organizar").
--
-- Nulo de propósito para as aulas que já existem: assim elas continuam
-- aparecendo na ordem de criação (o app trata nulo como "sem ordem definida"
-- e usa criado_em como desempate), e só passam a ter ordem própria quando
-- alguém realmente organizar a lista.
--
-- Já coberta pelas políticas de RLS existentes de "aulas" (0002_rls_policies.sql):
-- é uma coluna comum de conteúdo, sem regra especial.

alter table public.aulas add column if not exists ordem integer;

create index if not exists aulas_materia_ordem_idx on public.aulas (materia_id, ordem);
