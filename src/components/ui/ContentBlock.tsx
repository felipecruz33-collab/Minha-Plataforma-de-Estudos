import type { Bloco } from '../../lib/types'

export function ContentBlock({ bloco }: { bloco: Bloco }) {
  return <div className="conteudo-html" dangerouslySetInnerHTML={{ __html: bloco.html }} />
}
