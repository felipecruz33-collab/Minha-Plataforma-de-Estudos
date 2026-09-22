-- A anotação passa a poder apontar para uma AULA, e não só para a matéria.
--
-- "Matéria: Português" é grosso demais quando a pessoa tem trinta aulas de
-- Português: a anotação sobre colocação pronominal se perde no meio das
-- outras. Apontar a aula é o que faz a anotação ser reencontrada junto do
-- assunto dela.
--
-- Opcional, e cai para nulo quando a aula some — pelo mesmo motivo que
-- `materia_id` (ver 0019): texto escrito à mão não pode ser apagado de
-- tabela, e reimportar um PDF troca a aula de id. A anotação sobrevive à
-- reimportação; só perde o vínculo.
--
-- Sem `not null` e sem preenchimento retroativo: anotação já existente
-- continua presa só à matéria, que é onde ela estava.

alter table public.anotacoes
  add column if not exists aula_id uuid references public.aulas (id) on delete set null;

-- A lista filtra por aula dentro da matéria; sem isto vira varredura.
create index if not exists anotacoes_por_aula
  on public.anotacoes (user_id, aula_id) where aula_id is not null;
