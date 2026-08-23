# Prompt para converter PDF em aula .json (Minha Plataforma de Estudos)

Cole este texto em outra IA (ChatGPT, um chat separado do Claude, etc.) **junto com o PDF** da
matéria que você quer converter. O resultado é um JSON pronto para importar em
"Adicionar conteúdo → Arquivo .json" sem erro de validação.

Se o PDF cobrir mais de uma aula/capítulo, peça um JSON separado por aula (um bloco de código
por aula), não um único arquivo com tudo misturado.

---

Você vai transformar o conteúdo do PDF anexado em UM objeto JSON, seguindo EXATAMENTE o
formato abaixo. O JSON será importado automaticamente por um validador rígido — qualquer
campo fora do especificado, tipo errado ou tag HTML não permitida faz a importação falhar
inteira. Siga as regras à risca.

## Estrutura exata (não adicione nem remova nenhum campo)

```json
{
  "materia": "Nome da matéria",
  "aula": {
    "titulo": "Título da aula",
    "blocos": [
      { "tipo": "texto", "ordem": 0, "html": "<h3 class=\"subtitulo-aula\">1. Tópico</h3><p>Texto...</p><h4 class=\"miolo\">1.1 Subtópico</h4><p>Texto...</p>" },
      { "tipo": "dica", "ordem": 1, "html": "<div class=\"box dica\"><div class=\"box-title\">📘 Dica de prova</div><p>...</p></div>" },
      { "tipo": "alerta", "ordem": 2, "html": "<div class=\"box alerta\"><div class=\"box-title\">⚠️ Alerta / Pegadinha</div><p>...</p></div>" },
      { "tipo": "memorize", "ordem": 3, "html": "<div class=\"box memorize\"><div class=\"box-title\">✅ Memorize</div><ul><li>...</li></ul></div>" },
      { "tipo": "exemplo", "ordem": 4, "html": "<div class=\"box exemplo\"><div class=\"box-title\">💡 Exemplo</div><p>...</p></div>" },
      { "tipo": "palavra", "ordem": 5, "html": "<div class=\"box palavra\"><div class=\"box-title\">🔎 Atenção à palavra</div><p>...</p></div>" },
      { "tipo": "naoconfunda", "ordem": 6, "html": "<div class=\"naoconfunda\"><div class=\"naoconfunda-title\">🚫 Não confunda</div><p>...</p></div>" },
      { "tipo": "tabela", "ordem": 7, "html": "<table><thead><tr><th>Coluna</th></tr></thead><tbody><tr><td>Valor</td></tr></tbody></table>" }
    ],
    "questoes": [
      {
        "tema": "Assunto específico da questão",
        "banca": "",
        "ano": "",
        "orgao": "",
        "enunciado": "Enunciado completo da questão...",
        "alternativas": [
          { "id": "A", "texto": "..." },
          { "id": "B", "texto": "..." },
          { "id": "C", "texto": "..." },
          { "id": "D", "texto": "..." }
        ],
        "gabarito": "B",
        "explicacao": "Comentário geral da questão.",
        "altExp": {
          "A": "Errada — ...",
          "B": "Correta — ...",
          "C": "Errada — ...",
          "D": "Errada — ..."
        }
      }
    ]
  }
}
```

## Regras obrigatórias

- Raiz do JSON: **somente** as chaves `materia` e `aula`. Nenhuma outra.
- Dentro de `aula`: **somente** `titulo`, `blocos`, `questoes`. Nenhuma outra.
- Dentro de cada bloco: **somente** `tipo`, `ordem`, `html`. Nenhuma outra.
- `materia` e `aula.titulo`: texto não vazio.
- `tipo` aceita **apenas** estes 8 valores, sempre minúsculos: `texto`, `dica`, `alerta`,
  `memorize`, `exemplo`, `palavra`, `naoconfunda`, `tabela`. Qualquer outro valor derruba a
  importação inteira.
- `ordem`: número inteiro começando em 0, sem repetir dentro da mesma aula (0, 1, 2, 3...).
- `aula.questoes` pode ser uma lista vazia `[]` se o PDF não tiver questões — nunca invente
  questões que não existem no material.

## Regras do HTML dentro de cada `"html"`

- **Tags permitidas** (só estas): `p`, `h3`, `h4`, `ul`, `ol`, `li`, `strong`, `em`, `br`,
  `sub`, `sup`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`, `span`.
- **Proibido**: `script`, `style`, `iframe`, `link`, `img`, `object`, `embed`, links (`<a>`),
  qualquer tag fora da lista acima, qualquer atributo `on...` (`onclick` etc.) e qualquer
  atributo `src` em qualquer tag.
- Blocos `texto`: use `<h3 class="subtitulo-aula">` para tópicos e `<h4 class="miolo">` para
  subtópicos.
- Blocos `dica`, `alerta`, `memorize`, `exemplo`, `palavra`: o `html` precisa **já vir**
  embrulhado exatamente como no exemplo acima —
  `<div class="box NOMEDOTIPO"><div class="box-title">EMOJI Título</div>...conteúdo...</div>` —
  usando o emoji e texto do título exatamente como no exemplo de cada tipo.
- Bloco `naoconfunda`: usa classes diferentes — `<div class="naoconfunda"><div class="naoconfunda-title">🚫 Não confunda</div>...</div>`.
- Bloco `tabela`: só a tag `<table>` (com `thead`/`tbody`/`tr`/`th`/`td`), sem `div` de caixa
  em volta.

## Regras de conteúdo

- Leia o PDF inteiro, sem pular páginas nem resumir de forma rasa.
- Reescreva em linguagem simples e didática, sem perder precisão técnica.
- Use as caixas coloridas (`dica`, `alerta`, `memorize`, `exemplo`, `palavra`, `naoconfunda`)
  só quando fizer sentido — não force todas em toda aula.
- Preserve **todas** as questões do PDF, sem cortar nenhuma.
- **Nunca invente** banca, ano, órgão ou gabarito. Se o PDF não informar, deixe `""` (texto
  vazio) — nunca "chute".
- `alternativas`: cada `id` é uma letra única entre A e E (mínimo 2 alternativas); `gabarito`
  precisa ser um desses ids; `altExp` precisa ter uma entrada para cada id, explicando por que
  está certa ou errada.

## Formato de saída

Responda **apenas** com o JSON (dentro de um bloco de código \`\`\`json, sem nenhum texto
antes ou depois). JSON válido: aspas duplas, aspas internas escapadas com `\"`, sem vírgula
sobrando, sem comentários, UTF-8.
