-- Registro de uso da IA, gravado PELO SERVIDOR.
--
-- Por que uma tabela nova em vez de reaproveitar `geracoes_ia`: aquela é
-- escrita pelo navegador, depois que a aula é salva. Serve pro histórico da
-- tela "Gerações IA", mas não serve pra cobrar limite — quem chamasse a
-- função por fora do app simplesmente não gravaria linha nenhuma, e a cota
-- ficaria eternamente zerada.
--
-- Esta aqui é gravada dentro de api/gerar-aula.ts, ANTES de chamar a IA. Ou
-- seja: para consumir a IA é preciso deixar rastro, sem exceção.
--
-- As políticas deixam cada um ver e registrar só o próprio uso. Note que NÃO
-- existe política de update nem de delete: mesmo quem souber falar com o banco
-- direto consegue, no máximo, ADICIONAR uso — o que é contra o próprio
-- interesse de quem tentaria burlar.
create table if not exists public.uso_ia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Nome do arquivo: um PDF dividido em vários trechos gera várias linhas com
  -- o MESMO nome, e o limite conta arquivos distintos, não chamadas.
  arquivo text not null,
  caracteres integer not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists uso_ia_user_data_idx on public.uso_ia (user_id, criado_em desc);

alter table public.uso_ia enable row level security;

drop policy if exists "uso_ia: vê o próprio uso" on public.uso_ia;
create policy "uso_ia: vê o próprio uso" on public.uso_ia
  for select using (user_id = auth.uid());

drop policy if exists "uso_ia: registra o próprio uso" on public.uso_ia;
create policy "uso_ia: registra o próprio uso" on public.uso_ia
  for insert with check (user_id = auth.uid());
