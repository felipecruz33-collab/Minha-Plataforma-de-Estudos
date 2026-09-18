-- Batimento: uma linha gravada de tempos em tempos, só para o projeto não ser
-- classificado como inativo.
--
-- POR QUE UMA ESCRITA, SE JÁ HAVIA UM PING DE LEITURA
--
-- O robô lia o banco todo dia e recebia HTTP 200 — o projeto respondia. Mesmo
-- assim a Supabase mandou o aviso de "mais de 7 dias sem atividade
-- SUFICIENTE". O advérbio é o ponto: o critério tem limiar de volume, e uma
-- consulta de meio segundo por dia cabe dentro do que eles consideram parado.
-- Escrita é outra história: gera WAL, muda o armazenamento, aparece em
-- qualquer medição de uso que olhe para o banco de verdade.
--
-- O CUSTO, DITO EM VOZ ALTA
--
-- Isto abre a ÚNICA porta de escrita anônima do banco. A chave `anon` é
-- pública por natureza (vai dentro do aplicativo, qualquer um extrai), então
-- qualquer pessoa pode inserir aqui. O desenho abaixo existe para que essa
-- porta não sirva para mais nada além de bater o ponto:
--
--   1. A tabela NÃO TEM COLUNA DE CONTEÚDO. Só um id e um instante. Não há
--      onde escrever texto, então ela não vira armazenamento de graça nem
--      veículo para injetar coisa em outra tela.
--   2. Ninguém LÊ. Sem `select` para anon: nem quem insere consegue ver o que
--      está lá. Nada vaza porque não há nada a vazar, e ainda assim a tabela
--      não é um espelho de quem bateu ponto.
--   3. Ninguém APAGA nem ALTERA. Só insert, e mais nada.
--   4. O tamanho é LIMITADO NA RAIZ. A cada inserção, o gatilho poda a tabela
--      para as últimas 500 linhas. Alguém que resolva inserir um milhão de
--      vezes gasta a banda dele e deixa a tabela do mesmo tamanho — o abuso
--      não vira conta para pagar.

create table if not exists public.batimento (
  id bigint generated always as identity primary key,
  em timestamptz not null default now()
);

alter table public.batimento enable row level security;

-- Privilégio de tabela: só inserir. Sem select, sem update, sem delete.
revoke all on public.batimento from anon, authenticated;
grant insert on public.batimento to anon, authenticated;
grant all on public.batimento to service_role;

-- E a RLS pela mesma regra: só INSERT existe como política, então leitura,
-- alteração e exclusão não têm caminho nenhum.
drop policy if exists "batimento: qualquer um bate o ponto" on public.batimento;
create policy "batimento: qualquer um bate o ponto" on public.batimento
  for insert to anon, authenticated with check (true);

-- Poda automática. `security definer` porque quem insere não tem delete —
-- e é justamente isso que torna o limite inescapável para quem insere.
create or replace function public.podar_batimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.batimento
   where id <= (select max(id) - 500 from public.batimento);
  return null;
end;
$$;

-- Por COMANDO e não por linha: uma inserção em lote poda uma vez, não mil.
drop trigger if exists batimento_poda on public.batimento;
create trigger batimento_poda
  after insert on public.batimento
  for each statement execute function public.podar_batimento();
