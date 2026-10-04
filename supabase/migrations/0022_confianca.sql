-- Confiança da resposta: o quanto a pessoa tinha certeza ao marcar.
--
-- Uma coluna só, anulável, e nada mais. O resto — quem acerta chutando, quem
-- erra com certeza, a calibração por matéria — é tudo derivado desta coluna
-- junto do que `respostas` já guardava.
--
-- Por que vale uma coluna no banco:
--
--   ACERTOU CHUTANDO não é memória, é sorte, e antes disto subia degrau na
--   escada de revisão como um acerto de verdade — afastando o prazo de uma
--   questão que a pessoa não sabe.
--
--   ERROU COM CERTEZA é a lacuna mais valiosa que existe. Butterfield e
--   Metcalfe (2001, 2006) mediram a hipercorreção: erro cometido com alta
--   confiança é MAIS fácil de corrigir do que erro com baixa confiança,
--   porque o choque entre "eu sabia" e "errei" faz a pessoa prestar atenção
--   de verdade no gabarito.
--
-- Anulável de propósito: toda resposta já gravada continua válida, e quem não
-- liga o modo de confiança responde exatamente como sempre.

alter table public.respostas
  add column if not exists confianca text;

-- Recriada em vez de "add if not exists" porque o Postgres não tem essa forma
-- para constraint — e rodar a migração duas vezes não pode falhar.
alter table public.respostas
  drop constraint if exists respostas_confianca_valida;

alter table public.respostas
  add constraint respostas_confianca_valida
  check (confianca is null or confianca in ('chute', 'duvida', 'certeza'));

-- Índice só do que a tela de calibração realmente varre: as respostas da
-- pessoa que TÊM confiança marcada.
create index if not exists respostas_confianca
  on public.respostas (user_id, confianca)
  where confianca is not null;
