-- Índices que faltavam nas chaves estrangeiras mais quentes.
--
-- O PostgreSQL cria índice sozinho para chave PRIMÁRIA e para UNIQUE, mas
-- NÃO para chave estrangeira. Como as tabelas são compartilhadas por todos os
-- usuários, uma busca sem índice varre as linhas de todo mundo — e fica mais
-- lenta a cada usuário novo, mesmo que ninguém esteja usando ao mesmo tempo.
--
-- Medido num banco de teste com 400 usuários (156 mil questões), buscando as
-- questões de UMA aula:
--
--     sem índice:  808 ms   (varredura sequencial, 155.992 linhas descartadas)
--     com índice:  0,11 ms  (busca direta)
--
-- E essa busca acontecia uma vez por aula em cada tela que lista aulas.
--
-- Rodar isto é seguro a qualquer momento: índice não altera nenhum dado, e o
-- `if not exists` deixa repetir sem erro.

-- Questões: lidas por aula (tela da aula, banco de questões) e por matéria
-- (a própria política de RLS confere a matéria a cada linha).
create index if not exists questoes_aula_idx on public.questoes (aula_id);
create index if not exists questoes_materia_idx on public.questoes (materia_id);

-- Respostas: além das telas de Desempenho e Erradas, estas colunas são alvo
-- de exclusão em cascata. Sem índice, apagar uma questão (o que acontece toda
-- vez que uma aula é reimportada) obriga o banco a varrer TODA a tabela de
-- respostas para conferir se alguma apontava para ela.
create index if not exists respostas_questao_idx on public.respostas (questao_id);
create index if not exists respostas_user_aula_idx on public.respostas (user_id, aula_id);
create index if not exists respostas_user_materia_idx on public.respostas (user_id, materia_id);

analyze public.questoes;
analyze public.respostas;
