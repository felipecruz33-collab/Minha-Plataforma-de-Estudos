-- Bloco de notas do estudante, opcionalmente preso a uma matéria.
--
-- DUAS DECISÕES QUE VALEM EXPLICAÇÃO
--
-- 1. `materia_id` é OPCIONAL e cai para nulo quando a matéria some
--    (`on delete set null`, e não `cascade`). Anotação é texto que a pessoa
--    escreveu com a própria mão — é a coisa menos reconstituível do
--    aplicativo. Apagar uma matéria não pode levar junto o que ela escreveu
--    sobre o assunto; a anotação apenas deixa de ter matéria e continua na
--    lista. Compare com `respostas`, que somem por cascata de propósito: uma
--    resposta sem a questão não significa nada, um texto sem a matéria
--    significa tudo.
--
-- 2. Sem `not null` no conteúdo, mas com `default ''`. A tela salva sozinha
--    enquanto a pessoa digita, então uma anotação existe antes de estar
--    pronta; exigir título preenchido brigaria com o salvamento automático.

create table if not exists public.anotacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  materia_id uuid references public.materias (id) on delete set null,
  titulo text not null default '',
  corpo text not null default '',
  fixada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.anotacoes enable row level security;

-- Anotação é privada, ponto. Nem administrador lê a anotação de ninguém: não
-- existe política de leitura por cargo aqui, e isso é intencional.
drop policy if exists "anotacoes: acesso próprio" on public.anotacoes;
create policy "anotacoes: acesso próprio" on public.anotacoes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A lista abre ordenada pelas fixadas e depois pela edição mais recente; é
-- esta ordem que o índice serve.
create index if not exists anotacoes_do_usuario
  on public.anotacoes (user_id, fixada desc, atualizado_em desc);
