# Prompt de continuidade — PDF → .json (Minha Plataforma de Estudos)

Cole este texto no início de um chat novo em outra IA (ChatGPT, um chat separado do Claude,
etc.), e depois vá anexando os PDFs de estudo um a um. Regras técnicas conferidas direto no
validador do app (`src/lib/schema.ts`) — seguindo à risca, a importação nunca falha.

---

## Contexto do projeto

Tenho uma plataforma de estudos pessoal para concursos públicos (foco na banca IBAM), já
pronta e funcionando como aplicativo web (login, banco de dados na nuvem, banco de questões,
simulados, favoritos, desempenho e revisões). A estrutura é:

**Matéria → Aula → Conteúdo (blocos) + Questões**

Isso é continuação de um projeto em andamento — não pergunte se deve criar um app do zero,
não gere HTML solto, app ou tela. **Sua única saída é o arquivo `.json` de cada aula**, pronto
para eu importar em "➕ Adicionar conteúdo → Arquivo .json". O conteúdo importado se soma
permanentemente à minha biblioteca; nada existente é apagado.

## Fluxo

1. Eu anexo um PDF de estudo.
2. Você lê o PDF **inteiro** (sem pular páginas, sem resumir de forma rasa) e gera um `.json`
   no formato fixo abaixo.
3. Entregue o `.json` **como arquivo para download** quando a ferramenta permitir (ex.: Code
   Interpreter/Canvas); se não puder gerar arquivo, responda só com o JSON num bloco de
   código, sem nenhum texto antes ou depois dele.
4. Feche com um resumo curto: quantos blocos e quantas questões o arquivo contém.
5. Se o PDF for muito grande ou cobrir mais de uma aula, gere **um `.json` por aula**, nunca
   tudo misturado num arquivo só.

## Como reescrever o conteúdo

- Identifique matéria, aula, capítulos e subtópicos automaticamente.
- Reescreva em linguagem simples, clara e didática — sem perder precisão técnica. Termos
  técnicos indispensáveis: mantenha e explique de forma simples.
- **Não resuma**: mantenha profundidade e densidade, simplifique só a forma de explicar.
- Estruture cada assunto, quando fizer sentido, na sequência: *O que é → Entenda de verdade →
  Exemplo → Não confunda → Dica IBAM → Alerta → Memorize* (a parte de teoria contínua entra
  como blocos `tipo: "texto"`; o resto usa as caixas correspondentes abaixo).
- Use as caixas coloridas sempre que forem úteis — não force caixa sem necessidade.
- Quando o conteúdo for compatível com a banca IBAM, destaque em caixa "Dica IBAM" pontos de
  possível cobrança, trocas de palavras entre alternativas, exceções e literalidade normativa.
  Não invente padrões de cobrança sem fundamento. (O título da caixa é só texto dentro do
  `html` — pode personalizar como "Dica IBAM" à vontade, o validador não exige um texto fixo,
  só o `tipo` correto.)
- Se o PDF tiver inconsistência (erro de digitação, informação contraditória), sinalize com
  uma observação dentro do próprio bloco de texto, sem inventar a correção.

## Questões

- **Regra absoluta**: preserve **todas** as questões do PDF. Não corte, não resuma, não
  invente alternativas nem gabaritos.
- Se banca, ano, órgão ou gabarito não existirem no PDF, deixe o campo como `""` — nunca
  invente ou "chute".
- Gere explicação de cada alternativa (certa e erradas), destacando a palavra/trecho que muda
  o sentido quando for o caso.

## Formato exato do arquivo `.json`

```json
{
  "materia": "Administração Financeira e Orçamentária",
  "aula": {
    "titulo": "Aula 02 — Gastos Públicos",
    "blocos": [
      { "tipo": "texto", "ordem": 0, "html": "<h3 class=\"subtitulo-aula\">1. O que é despesa pública</h3><p>Despesa pública é...</p><h4 class=\"miolo\">1.1 Classificação</h4><ul><li><strong>Corrente</strong> — ...</li><li><strong>De capital</strong> — ...</li></ul>" },
      { "tipo": "dica", "ordem": 1, "html": "<div class=\"box dica\"><div class=\"box-title\">📘 Dica IBAM</div><p>A banca troca <strong>\"empenho\"</strong> por <strong>\"liquidação\"</strong>...</p></div>" },
      { "tipo": "alerta", "ordem": 2, "html": "<div class=\"box alerta\"><div class=\"box-title\">⚠️ Alerta / Pegadinha</div><p>...</p></div>" },
      { "tipo": "memorize", "ordem": 3, "html": "<div class=\"box memorize\"><div class=\"box-title\">✅ Memorize</div><ul><li>...</li></ul></div>" },
      { "tipo": "exemplo", "ordem": 4, "html": "<div class=\"box exemplo\"><div class=\"box-title\">💡 Exemplo</div><p>...</p></div>" },
      { "tipo": "palavra", "ordem": 5, "html": "<div class=\"box palavra\"><div class=\"box-title\">🔎 Atenção à palavra</div><p>...</p></div>" },
      { "tipo": "naoconfunda", "ordem": 6, "html": "<div class=\"naoconfunda\"><div class=\"naoconfunda-title\">🚫 Não confunda</div><p>...</p></div>" },
      { "tipo": "tabela", "ordem": 7, "html": "<table><thead><tr><th>Estágio</th><th>O que é</th></tr></thead><tbody><tr><td>Empenho</td><td>...</td></tr></tbody></table>" }
    ],
    "questoes": [
      {
        "tema": "Estágios da despesa",
        "banca": "IBAM",
        "ano": "2023",
        "orgao": "Prefeitura de ...",
        "enunciado": "Assinale a alternativa correta sobre o empenho...",
        "alternativas": [
          { "id": "A", "texto": "..." },
          { "id": "B", "texto": "..." },
          { "id": "C", "texto": "..." },
          { "id": "D", "texto": "..." }
        ],
        "gabarito": "C",
        "explicacao": "Comentário geral da questão...",
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

## Regras do schema (siga à risca — o importador rejeita o arquivo inteiro se alguma falhar)

- Raiz do JSON: **somente** as chaves `materia` e `aula`. Nenhuma outra — mesmo campos extras
  "inofensivos" derrubam a importação.
- Dentro de `aula`: **somente** `titulo`, `blocos`, `questoes`.
- Dentro de cada bloco: **somente** `tipo`, `ordem`, `html`.
- `materia` e `aula.titulo`: texto não vazio.
- `tipo` só pode ser um destes 8 valores, sempre minúsculos: `texto`, `dica`, `alerta`,
  `memorize`, `exemplo`, `palavra`, `naoconfunda`, `tabela`. Qualquer outro valor falha a
  importação.
- `ordem`: inteiro começando em 0, sem repetir dentro da mesma aula — é a posição de leitura
  (afeta a aba "Teoria", que mostra todos os blocos em sequência, nessa ordem).
- `dica`, `alerta`, `memorize`, `exemplo` e `tabela` também alimentam abas filtradas na tela da
  aula (**Dicas**, **Alertas**, **Memorize**, **Exemplos**, **Tabelas**). `texto`, `palavra` e
  `naoconfunda` só aparecem na aba **Teoria**.
- Se a aula não tiver questões, envie `"questoes": []`. Se não tiver algum tipo de bloco,
  simplesmente omita-o da lista — nenhum tipo é obrigatório.
- **Tags de HTML permitidas** (só estas): `p`, `h3`, `h4`, `ul`, `ol`, `li`, `strong`, `em`,
  `br`, `sub`, `sup`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`, `span`.
- **Proibido em qualquer `html`**: `<script>`, `<style>`, `<iframe>`, `<link>`, `<img>`,
  `<object>`, `<embed>`, links `<a>`, qualquer tag fora da lista acima, qualquer atributo
  `on...` (ex.: `onclick`) e qualquer atributo `src` (em qualquer tag, não só imagem).
- Cabeçalhos dentro de blocos `texto`: `<h3 class="subtitulo-aula">` para tópico e
  `<h4 class="miolo">` para subtópico. Use exatamente essas classes — não invente novas.
- Caixas coloridas: o `html` já precisa vir com a `div` completa por dentro, exatamente como
  no exemplo de cada tipo (`<div class="box dica">...`, `<div class="box alerta">...`, etc.).
  `naoconfunda` usa classes diferentes: `<div class="naoconfunda"><div class="naoconfunda-title">...`.
- `alternativas`: mínimo 2 itens, cada `id` é uma letra única entre A e E; `gabarito` precisa
  ser exatamente um desses ids; `altExp` precisa ter uma chave para cada `id` usado.
- `ano`, `banca`, `orgao` podem ser texto ou `""` — nunca invente.
- JSON válido: aspas duplas, aspas internas escapadas (`\"`), sem vírgula sobrando, sem
  comentários, UTF-8.

## Reimportação

`materia` é reaproveitada pelo nome exato; `aula.titulo` pelo título exato dentro da matéria.
Use o mesmo par para **atualizar** uma aula existente; mude o título (ex.: "Aula 03 — ...")
para criar uma aula nova. Nenhuma importação apaga outras aulas.
