type Token = {
  type: string
  content: string
}

type State = {
  tokens: Token[]
  env: Record<string, unknown>
}

type Markdown = {
  renderInline(src: string, env?: Record<string, unknown>): string
  core: {
    ruler: {
      push(name: string, rule: (state: State) => void): void
    }
  }
}

export default function htmlTableInline(md: Markdown) {
  md.core.ruler.push('html_table_inline', (state) => {
    for (const token of state.tokens) {
      if (token.type !== 'html_block' || !token.content.includes('<table')) continue
      // Match the browser's table DOM before Vue compiles the page. An
      // implicit tbody can otherwise trigger hydration and lose static SVGs.
      token.content = token.content.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
        if (/<(?:tbody|thead|tfoot)\b/i.test(table)) return table
        return table.replace(/(?:<tr\b[^>]*>[\s\S]*?<\/tr>\s*)+/gi, '<tbody>$&</tbody>')
      })
      if (!token.content.includes('$') && !token.content.includes('`')) continue
      token.content = token.content.replace(
        /(<(?:td|th)\b[^>]*>)([\s\S]*?)(<\/(?:td|th)>)/gi,
        (_m, open: string, inner: string, close: string) => {
          if (!inner.includes('$') && !inner.includes('`')) {
            return `${open}${inner}${close}`
          }
          const normalized = inner.replace(/\s+/g, ' ').trim()
          return `${open}${md.renderInline(normalized, {})}${close}`
        },
      )
    }
  })
}
