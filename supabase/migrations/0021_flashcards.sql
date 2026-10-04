-- Estado de cada flashcard no agendamento SM-2.
--
-- O QUE ENTRA AQUI, E O QUE NÃO ENTRA
--
-- NÃO entra o conteúdo do cartão: a frente é o enunciado da questão e o verso
-- é o gabarito comentado, que já estão na tabela `questoes`. Duplicar isso
-- criaria duas verdades sobre o mesmo material, e a reimportação de um PDF
-- deixaria o cartão falando de uma questão que mudou.
--
-- NÃO entra quais assuntos viram baralho: isso é uma leitura do histórico de
-- respostas, recalculada a cada abertura da tela. Mudar a régua amanhã (hoje
-- são três erros no mesmo assunto) não deixa nenhum dado velho errado.
--
-- Entra só o que NÃO dá para derivar: a facilidade, o intervalo e a data de
-- volta de cada cartão, que dependem de como a pessoa se saiu em cada
-- revisão — informação que nasce no clique e morre se não for gravada.

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  questao_id uuid not null references public.questoes (id) on delete cascade,
  -- "Ease factor" do SM-2. Começa em 2.5 e tem piso de 1.3.
  facilidade real not null default 2.5,
  intervalo_dias integer not null default 0,
  repeticoes integer not null default 0,
  lapsos integer not null default 0,
  proxima_em date not null default current_date,
  ultima_em date not null default current_date,
  criado_em timestamptz not null default now(),
  -- Um cartão por questão por pessoa. Sem isto, duas revisões disparadas quase
  -- juntas criariam dois agendamentos concorrentes para a mesma carta.
  unique (user_id, questao_id)
);

alter table public.flashcards enable row level security;

drop policy if exists "flashcards: acesso próprio" on public.flashcards;
create policy "flashcards: acesso próprio" on public.flashcards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A fila do dia é "meus cartões vencidos até hoje", e é esta a ordem dela.
create index if not exists flashcards_fila
  on public.flashcards (user_id, proxima_em);
