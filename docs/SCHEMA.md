# Contrato Técnico do Conteúdo (Seção 6)

## 6.1 — Formato exato do objeto de uma aula:

```json
{
  "materia": "Administração Financeira e Orçamentária",
  "aula": {
    "titulo": "Aula 02 — Gastos Públicos",
    "blocos": [
      { "tipo": "texto", "ordem": 0, "html": "<h3 class=\"subtitulo-aula\">1. O que é despesa pública</h3><p>Despesa pública é...</p><h4 class=\"miolo\">1.1 Classificação</h4><ul><li><strong>Corrente</strong> — ...</li></ul>" },
      { "tipo": "dica", "ordem": 1, "html": "<div class=\"box dica\"><div class=\"box-title\">📘 Dica de prova</div><p>Muitas bancas trocam <strong>\"empenho\"</strong> por <strong>\"liquidação\"</strong>...</p></div>" },
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
        "banca": "",
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
          "A": "Errada — ...",
          "B": "Errada — ...",
          "C": "Correta — ...",
          "D": "Errada — ..."
        }
      }
    ]
  }
}
```

## 6.2 — Regras obrigatórias do schema:

- **Campos obrigatórios**: `materia` (texto), `aula.titulo` (texto), `aula.blocos` (lista), `aula.questoes` (lista)
- **Tipos válidos**: `texto`, `dica`, `alerta`, `memorize`, `exemplo`, `palavra`, `naoconfunda`, `tabela` (sempre minúsculas)
- **Ordem**: começa em 0, não pode se repetir dentro da mesma aula
- **Classes HTML obrigatórias**:
  - `<h3 class="subtitulo-aula">` para tópicos
  - `<h4 class="miolo">` para subtópicos
- **Tags HTML permitidas**: `p`, `h3`, `h4`, `ul`, `ol`, `li`, `strong`, `em`, `br`, `sub`, `sup`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div`, `span`
- **Tags NUNCA permitidas**: `script`, `style`, `iframe`, `link`, imagens externas, atributos de evento (onclick, etc)
- **Alternativas**: cada `id` deve ser único (A-E); `gabarito` deve ser um desses ids; `altExp` precisa de uma chave para cada id
- **Campos vazios**: `banca`, `ano`, `orgao` podem ser "" (vazio). NUNCA inventar dados.
- **JSON válido**: aspas duplas, aspas internas escapadas, UTF-8

## 6.3 — Regra de reimportação:

- `materia` é identificada pelo nome exato
- `aula.titulo` deve ser exato dentro daquela matéria
- Se ambos coincidirem, a aula é ATUALIZADA (não duplicada)
- NENHUMA exclusão automática: só acontece por ação explícita do usuário

## 6.4 — Regras da IA interna (conversão PDF → Aula):

- ✅ Ler o PDF integralmente
- ✅ Identificar matéria, aula, capítulos e subtópicos automaticamente
- ✅ Reescrever em linguagem clara e didática, preservando precisão técnica
- ✅ Usar caixas coloridas quando REALMENTE úteis (não forçar)
- ✅ Quando o PDF mencionar banca, registrar em `banca`; caso contrário, deixar ""
- ✅ **REGRA ABSOLUTA**: preservar TODAS as questões do PDF (não cortar, não resumir)
- ✅ Gerar explicação de cada alternativa em `altExp`
- ✅ Resultado final segue exatamente o formato acima
