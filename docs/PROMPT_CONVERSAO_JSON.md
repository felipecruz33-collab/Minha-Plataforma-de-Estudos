# Prompt de conversão PDF → .json — versão 6

**Minha Plataforma de Estudos · Foco: Cebraspe, FGV e Vunesp · Objetivo: Auditor de Controle Externo (TCE / TCU)**

Cole este texto no início de um chat novo em qualquer IA com leitura de PDF (ChatGPT, Claude, Gemini, etc.)
e depois vá anexando os PDFs de estudo, um a um. As regras técnicas foram conferidas direto no validador
do app (`src/lib/schema.ts`) — seguindo à risca, a importação nunca falha.

> Este arquivo é a versão de texto do `PROMPT_CONVERSAO_JSON.pdf`, que está nesta mesma pasta.
> Os dois têm o mesmo conteúdo: use o `.md` para colar num chat, o `.pdf` para ler.

---

## 00 — O que mudou nesta versão 6

**1. Vocabulário de temas (novo — é o motivo desta versão).** O campo `tema` deixou de ser só um filtro:
ele virou **o campo mais importante do arquivo depois do enunciado**. É ele que forma os baralhos de
flashcards, intercala a fila de estudo, decide o espaçamento da revisão e monta o Desempenho por assunto.
Tema escrito de forma inconsistente (ou único por questão) desliga essas funções **sem dar erro nenhum na
importação**. Ver Seção 5, que é nova e obrigatória.

Mais quatro ajustes desta versão:

2. **O campo `explicacao` agora começa pela resposta direta**, em uma frase, antes do fundamento. Motivo:
   ele virou o verso do flashcard, lido sozinho, sem as alternativas na frente. (Seção 7.2.)
3. **A ordem das questões dentro do array passou a importar.** O app usa 3 questões espalhadas pelo array
   como pré-teste da aula, antes da teoria. Ordene as questões seguindo a ordem do conteúdo. (Seção 7.3.)
4. **Item Certo/Errado: a explicação afirma a regra**, em vez de só dizer que a assertiva está errada.
   Motivo: no flashcard, o verso tem que ensinar sozinho. (Seção 7.4.)
5. **Correção de duas regras que a v5 atribuía ao validador e não são dele:** `altExp` cobrir todas as
   alternativas e `explicacao` não ser vazio **não** derrubam a importação. Continuam sendo exigência de
   qualidade, mas agora estão no lugar certo do documento. (Seções 7 e 9.)

Tudo das versões 4 e 5 continua valendo: arquivo único por aula, linguagem didática sem perder densidade,
aproveitamento de grifos e destaques, caixas coloridas generosas, deduplicação de questões, comentário
alternativa por alternativa, identificação do padrão de cobrança, texto de apoio dentro do enunciado,
tabelas em linhas com barras e autoconferência da contagem de questões.

## 01 — Contexto do projeto

Tenho uma plataforma de estudos pessoal para concursos públicos, já pronta e funcionando como aplicativo
web (login, banco de dados na nuvem, banco de questões, simulados, favoritos, desempenho, revisão
espaçada, flashcards e anotações). A estrutura é:

**Matéria → Aula → Conteúdo (blocos) + Questões**

Estou me preparando para cargos de **Auditor de Controle Externo** em Tribunais de Contas (TCEs e TCU).
As bancas que mais me interessam são **Cebraspe, FGV e Vunesp**. Todo o material que eu anexar deve ser
tratado com o nível de profundidade exigido por essas bancas em provas de nível superior da área de controle.

Isto é a continuação de um projeto em andamento: **não pergunte se deve criar um app do zero, não gere HTML
solto, não gere app nem tela.** Sua única saída é o arquivo `.json` de cada aula, pronto para eu importar em
"Adicionar conteúdo → Arquivo .json". O conteúdo importado se soma permanentemente à minha biblioteca;
nada existente é apagado.

## 02 — Fluxo de trabalho

1. Eu anexo um PDF de estudo.
2. Você lê o PDF inteiro, página por página, sem pular nada e sem resumir de forma rasa — incluindo notas
   de rodapé, quadros, esquemas, tabelas, grifos, destaques em cor e questões espalhadas no meio do texto.
3. Você faz a **análise do padrão de cobrança** (Seção 4.5): varre todas as questões e anota o que mais se repete.
4. Você monta o **vocabulário de temas** da aula (Seção 5) — antes de escrever qualquer questão.
5. Você gera UM único `.json` no formato fixo da Seção 8, seguindo a profundidade da Seção 4, as regras de
   questões da Seção 7 (incluindo deduplicação) e a autoconferência da Seção 7.8 antes de considerar o
   arquivo pronto.
6. Entregue o `.json` como arquivo para download sempre que a ferramenta permitir (Code Interpreter,
   Canvas, etc.). Se não puder gerar arquivo, responda somente com o JSON dentro de um bloco de código,
   sem nenhum texto antes ou depois.
7. Feche com o resumo obrigatório da Seção 7.8: contagem de questões, duplicatas removidas, padrão de
   cobrança e **o mapa de temas**.

## 03 — Um PDF de aula = UM arquivo .json (regra principal)

Não fracione. Mesmo que o PDF tenha 100, 150 ou 200 páginas, o resultado é um único arquivo `.json` por
aula, contendo toda a teoria convertida em blocos e **todas** as questões do PDF (embutidas na teoria, de
"Questões Comentadas" e de "Listas de Questões"), já deduplicadas, dentro do array `questoes` do mesmo arquivo.

Como lidar com PDF grande sem perder qualidade:

- Processe o conteúdo internamente por assunto (PPA, LDO, LOA, Créditos Adicionais, etc.), mas junte tudo
  no mesmo arquivo ao final.
- Organize os blocos na ordem lógica do PDF, usando `<h3 class="subtitulo-aula">` para marcar cada grande assunto.
- **Regra de ouro:** se alguém ler o arquivo inteiro (teoria + questões), deve ter lido o PDF inteiro, com
  mais didática e igual ou maior densidade — e não uma seleção do que você achou mais importante.

Só gere mais de um arquivo se eu pedir explicitamente.

## 04 — Padrão de profundidade e didática

O objetivo é reescrever com **linguagem mais fácil e igual ou maior densidade**. Explique como um bom
professor explicaria para quem está vendo o assunto pela primeira vez — sem cortar nenhuma informação que
possa cair na prova. **Simplifique a forma de explicar, nunca o conteúdo.**

### 4.1 Linguagem fácil, conteúdo completo

- Frases curtas e diretas, voz ativa.
- Ao introduzir um termo técnico, explique-o em português claro na primeira vez e só então use o termo.
  Ex.: "a vinculação de receita — ou seja, carimbar um dinheiro para só poder ser gasto com uma finalidade
  específica — é vedada para impostos…".
- Analogias e exemplos do dia a dia quando ajudarem a fixar (sem substituir a regra técnica).
- Depois de explicar fácil, **sempre ancore na norma**: artigo, parágrafo, inciso, prazo, percentual.

### 4.2 Metas mínimas por aula

| Tamanho do trecho convertido | Mínimo de blocos | Observação |
| --- | --- | --- |
| Até 15 páginas | 12 a 18 blocos | Pelo menos 1 tabela, 1 dica, 1 memorize e 1 exemplo |
| 16 a 40 páginas | 20 a 35 blocos | Pelo menos 2 tabelas comparativas, várias caixas coloridas |
| Mais de 40 páginas | 35+ blocos, arquivo único | Densidade constante do início ao fim; nada raso |

São metas mínimas, não teto. O que não pode acontecer é um capítulo inteiro do PDF virar um parágrafo genérico.

### 4.3 O que cada assunto precisa conter

- **O que é** — definição precisa, com o termo técnico correto, explicado de forma simples primeiro.
- **Base normativa literal** — artigo, parágrafo, inciso e alínea, com a redação transcrita ou fielmente
  parafraseada. Para TCE/TCU, a literalidade da CF/1988, da Lei 4.320/1964, da LRF (LC 101/2000), da Lei
  14.133/2021 e das normas de cada TCE é cobrada palavra por palavra.
- **Entenda de verdade** — a lógica por trás da regra: por que existe, que problema resolve.
- **Números, prazos e valores** — sempre explicitados (datas de envio/devolução, percentuais, limites,
  quóruns, prazos de vigência).
- **Exceções e ressalvas** — o que a regra não alcança; hipóteses de dispensa; casos especiais.
- **Divergências** — posições de autores diferentes, entendimentos do TCU/STF, casos sem consenso.
- **Exemplo concreto** — de preferência com números ou situação de Tribunal de Contas (em caixa `exemplo`).
- **Comparações** — sempre que dois institutos forem parecidos, gere uma tabela e/ou um bloco `naoconfunda`.
- **Fechamento memorizável** — bloco `memorize` com o essencial em lista curta.

### 4.4 Aproveitamento de grifos, cores e destaques do PDF

- Texto grifado, colorido, em negrito, sublinhado ou em itálico → mantenha o destaque (`<strong>` para o
  núcleo da regra, `<em>` para ênfase leve) e considere virar caixa `memorize` ou `palavra`.
- Palavra isolada em destaque ("privativa", "deverá", "até") → caixa `palavra`.
- Quadros, esquemas e tabelas coloridas → `tabela` ou lista organizada; nunca suprimidos por serem "visuais".
- Boxes do próprio PDF (dica, atenção, importante, resumo) → a caixa colorida correspondente.
- Notas de rodapé com base legal ou fonte doutrinária → nunca omita.

### 4.5 Identificação do padrão de cobrança (antes de escrever a teoria)

Leia todas as questões do PDF e monte um mapa do que mais cai: (1) quais artigos aparecem repetidamente;
(2) quais institutos são mais cobrados; (3) quais pegadinhas se repetem (troca de prazo, "pode" × "deve",
lista taxativa × exemplificativa); (4) quais números a banca gosta de cobrar. Use esse mapa para reforçar
na teoria os pontos de maior incidência, criar caixas `dica` do tipo "isso cai muito" e garantir que nenhum
ponto muito cobrado fique raso. Informe o padrão identificado no resumo final.

### 4.6 Proibições de superficialidade

**Nunca faça isso:**

- Escrever "entre outros", "etc." ou "dentre os quais se destacam" no lugar de listar tudo que o PDF lista.
- Citar artigo sem número ("conforme a Constituição" → errado; "art. 165, § 1º, da CF/1988" → certo).
- Trocar prazo ou percentual concreto por expressão vaga.
- Suprimir esquema/quadro por ser "visual".
- Omitir nota de rodapé com base legal ou fonte doutrinária.
- Resumir a explicação de uma questão porque "já foi explicado na teoria".
- Deixar de aproveitar um destaque visual do PDF.

## 05 — Vocabulário de temas (novo e obrigatório)

### Por que isto virou a seção mais importante do documento

O app não usa mais o `tema` só como filtro. Hoje ele é a chave de quatro mecanismos:

- **Flashcards.** Quando eu erro **3 vezes dentro do mesmo tema**, o app cria sozinho um baralho de
  repetição espaçada daquele assunto. A comparação é por **texto exato** do campo.
- **Intercalação.** A fila de revisão, a sessão de flashcards e o simulado são reordenados para que duas
  questões vizinhas nunca sejam do mesmo tema.
- **Espaçamento da revisão.** Questão cujo tema já tem baralho passa a voltar numa escada mais longa
  (3, 7, 21, 60, 120 dias em vez de 1, 3, 7, 21, 60), porque o flashcard já está cobrando aquela memória.
- **Desempenho por assunto.** Uma linha por tema.

### O erro que não dá erro

Tema inconsistente **não quebra a importação** — o arquivo entra normalmente e eu não percebo nada. O que
acontece é pior: os quatro mecanismos acima simplesmente não ligam. Com 60 questões em 50 temas
diferentes, nenhum baralho nunca se forma, porque nunca há 3 erros no mesmo texto de tema. E
`"PPA — prazos"`, `"PPA – prazos"` e `"PPA — Prazos"` são **três temas diferentes** para o app (travessão
diferente, maiúscula diferente).

### 5.1 As seis regras do tema

1. **Agrupador, não etiqueta.** O tema identifica o *ponto cobrado*, não a questão. Várias questões
   compartilham o mesmo tema — é isso que faz o mecanismo funcionar.
2. **De 5 a 15 temas por aula**, e cada tema com **3 ou mais questões** sempre que o PDF permitir. Se um
   tema ficou com uma questão só, pergunte-se se ele não é na verdade um recorte fino de um tema maior — e junte.
3. **Repetição literal.** Mesmo ponto = mesma string, caractere por caractere: mesma acentuação, mesmas
   maiúsculas, mesmo travessão (`—`), mesmos espaços. Mantenha a lista de temas da aula aberta ao seu lado
   e copie dela.
4. **Consistente entre aulas da mesma matéria.** Os baralhos são formados olhando **todo o meu histórico**,
   não uma aula só. Se "Créditos adicionais — extraordinários" aparece na Aula 02 e na Aula 07, escreva
   igual nas duas: os erros somam e viram um baralho. Escrito diferente, viram dois assuntos que nunca
   atingem o corte.
5. **Formato `Assunto — recorte`.** Específico o suficiente para ser útil e geral o suficiente para
   repetir. Nunca inclua número de questão, banca, ano ou "Aula 02" no tema.
6. **Nunca vazio.** Tema vazio derruba a importação, e tema genérico ("Diversos", "Questões") desliga tudo
   que esta seção descreve.

### 5.2 Calibragem: nem grosso, nem fino

| Grosso demais (desliga tudo) | Fino demais (nunca forma baralho) | No ponto |
| --- | --- | --- |
| "Orçamento" | "PPA — prazo de devolução pelo Legislativo no primeiro ano de mandato" | "PPA — prazos de envio e devolução" |
| "LRF" | "Metas fiscais — anexo de metas do art. 4º, § 1º" | "LRF — metas fiscais" |
| "Licitação" | "Dispensa por valor em obras — limite de R$ 100.000,00" | "Lei 14.133 — contratação direta por dispensa" |
| "Controle externo" | "Parecer prévio sobre as contas do prefeito — prazo de 60 dias" | "Controle externo — parecer prévio" |

### 5.3 Como montar (faça antes de escrever as questões)

1. Liste os grandes assuntos da aula (normalmente os mesmos `<h3>` da teoria).
2. Quebre cada um nos pontos que as questões realmente cobram — use o mapa de cobrança da Seção 4.5.
3. Escreva a lista final de temas, no formato `Assunto — recorte`, e **só então** comece a montar o array
   de questões, atribuindo a cada uma um tema *dessa lista*.
4. Se uma questão não couber em nenhum tema da lista, acrescente um tema novo à lista — não invente um
   tema solto no meio do array.
5. **Declare a lista no resumo final**, com a contagem de questões de cada tema. É assim que eu confiro se
   o arquivo vai funcionar.

Exemplo de mapa de temas no resumo final:

```
PPA — prazos de envio e devolução (5) · LDO — conteúdo obrigatório (4) ·
LOA — princípio da exclusividade (3) · Créditos adicionais — suplementares (6) ·
Créditos adicionais — extraordinários (4) · Vedações do art. 167 da CF (3)
```

## 06 — Caixas coloridas: como e quando usar

As caixas deixam o estudo visual e separam o essencial do texto corrido. Use com generosidade, **sem
inventar conteúdo** — tudo sai do PDF. Os oito tipos:

| Tipo | Para que serve | Quando usar |
| --- | --- | --- |
| `texto` | Corpo da teoria (com `<h3>`/`<h4>`) | Sempre; é a espinha dorsal |
| `dica` | Padrão de cobrança da banca / "isso cai muito" | Ponto com incidência alta em prova |
| `alerta` | Pegadinha do próprio conteúdo, independe de banca | Regra com exceção que derruba a maioria |
| `memorize` | Resumo essencial em lista curta | Fechamento de cada grande assunto |
| `exemplo` | Exemplo concreto, de preferência com números | Sempre que ajudar a fixar |
| `palavra` | Uma única expressão crítica do texto legal | "privativa" × "exclusiva", "poderá" × "deverá" |
| `naoconfunda` | Dois institutos parecidos lado a lado | Sempre que houver risco de confusão |
| `tabela` | Comparações, quadros, esquemas | Toda comparação e todo quadro do PDF |

### 6.1 Dicas específicas por banca

O título da caixa é livre — use "Dica Cebraspe", "Dica FGV", "Dica Vunesp" ou "Dica de prova". **Não
invente padrão de cobrança sem base:** se o PDF não indicar, faça uma dica genérica em vez de atribuir um
comportamento a uma banca.

| Banca | Como costuma cobrar | O que destacar na dica |
| --- | --- | --- |
| Cebraspe | Itens Certo/Errado; literalidade seca; troca de uma única palavra; generalizações ("sempre", "apenas", "em nenhuma hipótese"); item incompleto que ainda assim é certo. | A palavra exata que inverte o item; quando a omissão de parte da regra torna certo × errado; "pode" × "deve"; lista taxativa × exemplificativa. |
| FGV | Enunciados longos e contextualizados; casos práticos; assertivas em romanos para combinar; pegadinha conceitual fina; doutrina e jurisprudência do TCU. | Como o caso concreto se encaixa na regra; a diferença fina entre dois institutos; qual assertiva costuma ser a falsa; entendimento do TCU/STF. |
| Vunesp | Cobrança literal de lei; alternativas quase idênticas com uma palavra trocada; prazos, valores, percentuais e competências. | O número exato (prazo, percentual, quórum); a competência correta; os pares de palavras que a banca troca. |

Por eu mirar controle externo, priorize nas dicas: competências do TCU e dos TCEs (art. 70 a 75 da
CF/1988), prestação e tomada de contas, responsabilidade de agentes públicos, ciclo orçamentário, LRF,
controle interno × externo, fiscalização operacional e de resultados, e o papel do parecer prévio.

### 6.2 Alerta × Dica × Palavra

- `dica` para o padrão da banca ("a Vunesp troca o prazo de 31/08 por 30/09").
- `alerta` para a pegadinha do próprio conteúdo ("a exigência tem duas formas alternativas de atendimento,
  e a maioria só lembra da primeira").
- `palavra` quando o ponto crítico for uma única expressão legal ("privativa" × "exclusiva", "até" ×
  "a partir de").

## 07 — Questões: regras absolutas

- **Preserve todas as questões do PDF**, inclusive as embutidas no meio da teoria, as de "Questões
  Comentadas" e as das "Listas de Questões" do final, mesmo quando a lista só traz o gabarito numa tabela
  ao fim. Exceção: duplicatas (7.7).
- Não corte, não resuma, não junte duas em uma, não invente alternativas nem gabaritos.
- Se banca, ano, órgão ou gabarito não existirem no PDF, deixe o campo como `""`. **Nunca chute.**
- Itens Certo/Errado viram duas alternativas: A = "Certo", B = "Errado", com o gabarito na letra correta.
- Assertivas em romanos (padrão FGV) trazem o texto completo de cada assertiva **dentro do enunciado**, e a
  explicação diz, uma a uma, se I, II, III estão certas ou erradas e por quê.
- O `tema` sai da lista da Seção 5 — nunca inventado na hora.

### 7.1 Comentário alternativa por alternativa (`altExp`)

Toda questão sai com `altExp` completo: uma chave por alternativa. Para cada uma: comece por "Correta —" ou
"Errada —", diga por quê com fundamento (artigo/regra) e aponte **a palavra ou o trecho exato** que torna a
alternativa certa ou errada.

**Por que isto importa mais do que parece:** depois de corrigir, o app deixa abrir o comentário **de todas
as alternativas** — inclusive para quem acertou, que é justamente quem pode ter acertado por eliminação
errada. Um `altExp` pobre some na tela; um bom é metade do estudo da questão.

### 7.2 O campo `explicacao` começa pela resposta direta (novo)

Estrutura obrigatória, nesta ordem:

1. **Uma frase afirmando a regra** que resolve a questão. Direta, sem rodeio, sem "a alternativa C está
   correta porque".
2. O fundamento legal com artigo.
3. O raciocínio de resolução e o erro típico de quem marca errado.

**Por quê:** este campo virou **o verso do flashcard**. Quando um assunto passa a ser treinado em cartão, a
frente mostra o enunciado *sem as alternativas* e o verso mostra gabarito + texto da alternativa correta +
`explicacao`. Ou seja: a explicação é lida fora do contexto da questão, por alguém tentando lembrar a
regra. Se ela começa com "a letra C está correta", o verso do cartão não ensina nada.

Errado:

```
"explicacao": "A alternativa C está correta, conforme já explicado na teoria."
```

Certo:

```
"explicacao": "O empenho é o primeiro estágio da despesa e cria para o Estado a obrigação de pagamento,
pendente ou não de implemento de condição (art. 58 da Lei 4.320/1964). Ele não é o reconhecimento da
dívida — isso é a liquidação (art. 63). Quem erra costuma trocar os dois, porque ambos antecedem o pagamento."
```

### 7.3 Ordem das questões dentro do array (novo)

Ordene `questoes` seguindo a **ordem do conteúdo na aula**: as do primeiro assunto primeiro, as do último
por último, e as embutidas na teoria perto de onde o assunto delas aparece.

**Por quê:** quando eu abro uma aula que nunca respondi, o app oferece um **pré-teste**: três perguntas da
própria aula, *antes* da teoria — tentar e não saber faz a leitura seguinte render muito mais. Essas três
são tiradas do array em posições espalhadas (começo, meio e fim). Se o array estiver fora de ordem, o
pré-teste pode cair três vezes no mesmo assunto e perde a função. Evite também abrir o array com a questão
mais longa do PDF: ela é a primeira do pré-teste.

### 7.4 Item Certo/Errado: a explicação afirma a regra (novo)

Em item Certo/Errado, não basta dizer que a assertiva está errada — a `explicacao` tem que **afirmar como a
regra realmente é**, porque é essa frase que vai virar o verso do flashcard.

Errado:

```
"explicacao": "Errado. A assertiva contraria a lei."
```

Certo:

```
"explicacao": "Os créditos extraordinários só podem ser abertos para despesas imprevisíveis e urgentes,
como guerra, comoção interna ou calamidade pública (art. 167, § 3º, da CF/1988), e por medida provisória
no âmbito federal (art. 62). A assertiva erra ao exigir autorização legislativa prévia — é justamente o
que esse tipo de crédito dispensa."
```

### 7.5 Texto de apoio (obrigatório)

Muita questão não se sustenta sozinha: depende de um texto que vem ANTES dela no PDF — um poema, uma
notícia, um caso concreto, um trecho de lei, um balancete. **Regra: o campo `enunciado` precisa ser
autossuficiente.** Quem nunca viu o PDF tem que conseguir responder lendo apenas esse campo.

1. Copie o texto de apoio **inteiro** no começo do enunciado, antes do comando. Nunca resuma, nunca corte,
   nunca troque por uma descrição.
2. Se o mesmo texto serve a várias questões, **repita ele em cada uma**. No app cada questão vive sozinha:
   é sorteada em simulado, filtrada por assunto, revisada isolada e pode virar flashcard. Por isso são
   proibidas referências como "o texto acima", "conforme a questão 1", "segundo o fragmento anterior".
3. Formato: o texto de apoio primeiro, uma linha em branco, depois o comando. Preserve versos e parágrafos
   com `\n`.
4. Tabelas: ver 7.6.
5. Se o apoio for imagem ou gráfico que você não consegue ler, descreva com honestidade o que der e diga
   que a figura não veio. **Nunca invente o conteúdo da figura.**
6. Contagem: um texto de apoio com 5 questões continua sendo 5 questões.

Errado (o texto se perde e a questão fica sem resposta possível):

```json
"enunciado": "De acordo com o texto, a expressão 'ecoou pelo vale' sugere que:"
```

Certo (a questão se basta):

```json
"enunciado": "O trem partiu da estação às seis da manhã, ainda no escuro.\nO apito ecoou pelo vale inteiro, e só então a cidade acordou.\n\nDe acordo com o texto, a expressão 'ecoou pelo vale' sugere que:"
```

### 7.6 Tabelas dentro do enunciado

Metade das questões de orçamento, contabilidade e estatística tem uma tabela no apoio. Escreva em linhas
com barras:

```
| Descrição e justificativa do objeto | Valor |
| --- | --- |
| Aquisição de uniformes de inverno e verão para os alunos | R$ 100.000,00 |
| Contrato de serviços de gestão com organização social de saúde | R$ 674.938,00 |
| Total | R$ 774.938,00 |
```

1. Cabeçalho na primeira linha, `| --- | --- |` na segunda — é essa linha que diz ao app que a primeira é
   cabeçalho.
2. Uma linha por linha da tabela, começando e terminando com barra, sempre com o mesmo número de colunas.
3. **Copie os valores exatamente como estão no PDF** — com R$, pontos, vírgulas, sinais e unidades. Número
   reescrito "para ficar bonito" muda a resposta.
4. A tabela vai no lugar onde aparece no original, com uma linha em branco antes e depois.
5. Barra literal dentro de célula: `\|`.
6. Vale também em `explicacao` e `altExp`, quando o comentário repete os números.

No JSON isso é uma string só, com `\n` separando as linhas — não existe campo novo para tabela:

```json
"enunciado": "Considere o decreto hipotético a seguir.\n\nArt. 1º. Fica aberto Crédito Adicional Suplementar no valor de R$ 774.938,00 destinados às dotações seguintes:\n\n| Descrição e justificativa do objeto | Valor |\n| --- | --- |\n| Aquisição de uniformes de inverno e verão para os alunos | R$ 100.000,00 |\n| Contrato de serviços de gestão com organização social de saúde | R$ 674.938,00 |\n| Total | R$ 774.938,00 |\n\nCom base no caso apresentado, é correto afirmar que:"
```

Uma barra solta no meio de uma frase não vira tabela — o app só reconhece **duas ou mais linhas seguidas**
de barras, com pelo menos duas colunas. Escrever "multa | sanção" num parágrafo é seguro.

### 7.7 Deduplicação de questões

1. É duplicata quando duas questões têm o mesmo enunciado (ou praticamente idêntico) e a mesma origem
   (banca/ano/órgão), ainda que uma esteja comentada e a outra não.
2. Mantenha só **a versão mais completa** (com comentário), aproveitando da outra apenas o gabarito, se a
   comentada não o trouxer.
3. Nunca inclua a mesma questão duas vezes no array.
4. Informe quantas duplicatas foram removidas no resumo final.

Cuidado para não confundir duplicata com questões diferentes que só se parecem: se os enunciados são sobre
o mesmo assunto mas com textos distintos, são questões diferentes — mantenha as duas (e, aliás, dê a elas o
**mesmo tema**).

### 7.8 Autoconferência obrigatória e resumo final

1. **Conte os marcadores de questão no PDF de origem**, percorrendo o documento inteiro: "Gabarito:",
   "Comentário:", "(CESPE", "(CEBRASPE", "(FGV", "(VUNESP", enunciados numerados seguidos de banca,
   "Julgue o item", "Assinale a alternativa". O maior número encontrado é a **contagem mínima esperada**.
2. Monte o `questoes` já deduplicado.
3. Confira: questões no arquivo + duplicatas removidas ≥ contagem mínima esperada?
4. Se não bater, **não entregue**: volte ao PDF e procure as que faltaram — costumam estar embutidas num
   parágrafo de teoria contínua, na primeira/última página de uma seção, ou em listas cujo gabarito só
   aparece numa tabela páginas depois. Repita até bater.

**Resumo obrigatório ao final da entrega**, sempre com: (a) contagem mínima esperada; (b) quantas questões
entraram; (c) quantas duplicatas foram removidas; (d) confirmação de que (b)+(c) fecham com (a); (e) o
padrão de cobrança identificado; (f) **o mapa de temas com a contagem de questões de cada um** (Seção
5.3). Se não fechar mesmo após revisar, diga isso explicitamente — nunca entregue calado um número menor.

## 08 — Formato exato do arquivo .json

Parte 1 — identificação da aula e blocos de conteúdo:

```json
{
  "materia": "Orçamento Público (AFO)",
  "aula": {
    "titulo": "Aula 02 — Créditos Ordinários e Adicionais",
    "blocos": [
      { "tipo": "texto", "ordem": 0, "html": "<h3 class=\"subtitulo-aula\">1. O que é despesa pública</h3><p>Despesa pública é...</p><h4 class=\"miolo\">1.1 Classificação</h4><ul><li><strong>Corrente</strong> — ...</li><li><strong>De capital</strong> — ...</li></ul>" },
      { "tipo": "dica", "ordem": 1, "html": "<div class=\"box dica\"><div class=\"box-title\">📘 Dica Cebraspe — isso cai muito</div><p>A banca troca <strong>\"empenho\"</strong> por <strong>\"liquidação\"</strong>...</p></div>" },
      { "tipo": "alerta", "ordem": 2, "html": "<div class=\"box alerta\"><div class=\"box-title\">⚠ Alerta / Pegadinha</div><p>...</p></div>" },
      { "tipo": "memorize", "ordem": 3, "html": "<div class=\"box memorize\"><div class=\"box-title\">✅ Memorize</div><ul><li>...</li></ul></div>" },
      { "tipo": "exemplo", "ordem": 4, "html": "<div class=\"box exemplo\"><div class=\"box-title\">📝 Exemplo</div><p>...</p></div>" },
      { "tipo": "palavra", "ordem": 5, "html": "<div class=\"box palavra\"><div class=\"box-title\">🔎 Atenção à palavra</div><p>...</p></div>" },
      { "tipo": "naoconfunda", "ordem": 6, "html": "<div class=\"naoconfunda\"><div class=\"naoconfunda-title\">🚫 Não confunda</div><p>...</p></div>" },
      { "tipo": "tabela", "ordem": 7, "html": "<table><thead><tr><th>Estágio</th><th>O que é</th></tr></thead><tbody><tr><td>Empenho</td><td>...</td></tr></tbody></table>" }
    ],
```

Parte 2 — questões (continuação do mesmo arquivo). O `tema` tem que sair da lista montada na Seção 5 — e
repare que **não existe comentário dentro do JSON**: o formato não aceita.

```json
    "questoes": [
      {
        "tema": "Estágios da despesa — empenho",
        "banca": "Cebraspe",
        "ano": "2025",
        "orgao": "TCE-XX / Auditor de Controle Externo",
        "enunciado": "Assinale a alternativa correta sobre o empenho...",
        "alternativas": [
          { "id": "A", "texto": "..." },
          { "id": "B", "texto": "..." },
          { "id": "C", "texto": "..." },
          { "id": "D", "texto": "..." }
        ],
        "gabarito": "C",
        "explicacao": "O empenho é o primeiro estágio da despesa e cria a obrigação de pagamento (art. 58 da Lei 4.320/1964). Ele não é o reconhecimento da dívida — isso é a liquidação (art. 63). Quem erra troca os dois.",
        "altExp": {
          "A": "Errada — a palavra \"liquidação\" muda o sentido porque...",
          "B": "Errada — ...",
          "C": "Correta — ...",
          "D": "Errada — ..."
        }
      }
    ]
  }
}
```

Escreva tudo com acentuação normal, em UTF-8. Emojis nos títulos das caixas são permitidos.

## 09 — Regras do schema (o importador rejeita o arquivo inteiro se alguma falhar)

- **Raiz do JSON:** somente `materia` e `aula`. Nenhuma outra chave — até campos extras "inofensivos"
  derrubam a importação.
- **Dentro de `aula`:** somente `titulo`, `blocos`, `questoes`. **Dentro de cada bloco:** somente `tipo`,
  `ordem`, `html`.
- `materia` e `aula.titulo`: texto não vazio.
- `tipo` só aceita estes 8 valores, em minúsculas: `texto`, `dica`, `alerta`, `memorize`, `exemplo`,
  `palavra`, `naoconfunda`, `tabela`.
- `ordem`: inteiro começando em 0, sem repetir dentro da mesma aula.
- `dica`, `alerta`, `memorize`, `exemplo` e `tabela` também alimentam abas filtradas na tela da aula.
  `texto`, `palavra` e `naoconfunda` só aparecem na aba Teoria.
- Aula sem questões: `"questoes": []`. Tipo de bloco ausente: simplesmente omita — nenhum tipo é obrigatório.
- **Tags HTML permitidas (só estas):** `p`, `h3`, `h4`, `ul`, `ol`, `li`, `strong`, `em`, `br`, `sub`,
  `sup`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`, `span`.
- **Proibido em qualquer html:** `script`, `style`, `iframe`, `link`, `img`, `object`, `embed`, links
  `<a>`, qualquer tag fora da lista, qualquer atributo `on...` (ex.: `onclick`) e qualquer atributo `src`.
- **Cabeçalhos:** `<h3 class="subtitulo-aula">` para tópico e `<h4 class="miolo">` para subtópico.
  Exatamente essas classes.
- **Caixas:** o html já vem com a div completa por dentro. Atenção: `naoconfunda` usa classes diferentes
  (`<div class="naoconfunda"><div class="naoconfunda-title">`).
- `alternativas`: mínimo 2 itens; cada `id` é uma letra única **maiúscula** entre A e E; `texto` não vazio;
  `gabarito` precisa ser exatamente um desses ids.
- `altExp` é obrigatório e deve ser um objeto. As chaves que existirem precisam apontar para alternativas
  que existem e ter texto não vazio.
- `tema` e `enunciado`: texto **não vazio**. `banca`, `ano`, `orgao`, `gabarito` e `explicacao` precisam
  ser texto (podem ser `""`), **nunca `null`**.
- JSON válido: aspas duplas, aspas internas escapadas, sem vírgula sobrando, sem comentários, UTF-8.

> **Duas correções em relação à versão 5.** A v5 dizia que `altExp` precisa cobrir **todas** as
> alternativas e que `explicacao` não pode ser vazio, como se fossem regras do validador. **Não são** — o
> arquivo importa sem isso. Continuam sendo **exigência de qualidade** (Seções 7.1 e 7.2), e por um motivo
> concreto: o comentário por alternativa é lido na tela depois da correção, e a `explicacao` é o verso do
> flashcard. Mas saber a diferença importa: se uma importação falhar, não é por causa delas.

## 10 — Como o app usa este arquivo (contexto que justifica as regras)

Você não precisa decorar esta seção, mas ela explica por que as regras acima são o que são. O app não
guarda "o que estudar": ele **deriva tudo** do histórico de respostas, e as decisões dele são baseadas em
pesquisa de memória e aprendizagem.

| Mecanismo | Como funciona | O que o arquivo precisa dar |
| --- | --- | --- |
| **Ciclo de revisão** | Questão errada volta em 1, 3, 7, 21 e 60 dias, subindo um degrau por acerto. Só **um acerto por dia** conta: acertar três vezes na mesma noite não vale três degraus. | Questão autossuficiente, que se responde sozinha semanas depois. |
| **Flashcards** | 3 erros no mesmo `tema` criam um baralho (SM-2). A frente é o enunciado **sem alternativas**; o verso é gabarito + alternativa correta + `explicacao`. O cartão fica "aprendido" com 3 acertos em sessões diferentes. | Tema consistente (Seção 5) e `explicacao` que ensina sozinha (7.2). |
| **Espaçamento esticado** | Questão cujo tema já tem baralho volta em 3, 7, 21, 60, 120 dias, para não cobrar o mesmo conteúdo duas vezes por semana em dois lugares. | Tema consistente. |
| **Intercalação** | Fila, sessão de cartões e simulado são reordenados para não pôr dois temas iguais em sequência — alternar treina *identificar* o instituto, que é o que a prova cobra. | Temas que se repetem entre questões (sem isso não há o que alternar). |
| **Pré-teste** | Aula nunca respondida abre com 3 questões dela, espalhadas pelo array, antes da teoria. | Array na ordem do conteúdo (7.3). |
| **Modo confiança** | Eu declaro se chutei, estava em dúvida ou tinha certeza. Acerto chutado não aumenta prazo; erro com certeza vai para a frente da fila. | Alternativas realmente distintas, sem duas corretas por descuido. |
| **Correção adiada** | Posso marcar uma bateria inteira e corrigir só no fim, trocando a resposta antes. | `altExp` e `explicacao` densos: é tudo lido de uma vez, no fim. |

## 11 — Checklist antes de me entregar o arquivo

- [ ] É um único arquivo com toda a teoria + todas as questões?
- [ ] O JSON abre sem erro de sintaxe e a raiz tem só `materia` e `aula`?
- [ ] Todos os `tipo` estão entre os 8 valores permitidos, em minúsculas? A `ordem` começa em 0 e não repete?
- [ ] Nenhum `html` tem tag proibida, atributo `on...` ou `src`?
- [ ] **O vocabulário de temas tem de 5 a 15 temas, cada um com 3+ questões quando possível, escritos
      literalmente iguais entre si e consistentes com as outras aulas da matéria?**
- [ ] **O mapa de temas, com a contagem de cada um, está no resumo final?**
- [ ] **Toda `explicacao` começa afirmando a regra, em uma frase, antes do fundamento?**
- [ ] **O array de questões está na ordem do conteúdo da aula?**
- [ ] Todas as questões do PDF entraram (inclusive as do meio da teoria e das listas), sem duplicatas?
- [ ] Toda questão que dependia de texto de apoio está com o texto dentro do enunciado, e nenhum enunciado
      diz "o texto acima" ou "conforme a questão anterior"?
- [ ] Toda tabela de enunciado foi escrita em linhas com barras, com os valores copiados exatamente como
      estavam no PDF?
- [ ] Todo `tema` e `enunciado` é texto não vazio, e nenhum campo é `null`?
- [ ] Todo `gabarito` corresponde a um `id` existente e todo `id` tem chave em `altExp`?
- [ ] A teoria aproveitou os grifos/cores/negritos do PDF e reforçou o padrão de cobrança identificado?
- [ ] Há caixas coloridas suficientes para o estudo ficar visual e agradável?
- [ ] O conteúdo atingiu a meta mínima de blocos da Seção 4.2 e nenhum tópico ficou raso?

## 12 — Reimportação

`materia` é reaproveitada pelo **nome exato**; `aula.titulo` pelo **título exato** dentro da matéria. Use o
mesmo par para atualizar uma aula existente; mude o título (ex.: "Aula 03 — …") para criar uma aula nova.
Nenhuma importação apaga outras aulas.

Padronize os nomes de matéria para não fragmentar a biblioteca. Os que eu uso: "Orçamento Público (AFO)",
"Administração Financeira e Orçamentária", "Controle Externo", "Direito Financeiro", "Contabilidade
Pública", "Auditoria Governamental", "Direito Administrativo", "Administração Geral", "Língua Portuguesa".

> **Reimportação e temas.** Ao atualizar uma aula já importada, **mantenha os mesmos temas de antes**
> sempre que o ponto cobrado for o mesmo. Tema reescrito numa reimportação faz o app tratar o assunto como
> novo, e o progresso de baralho daquele tema começa do zero.
