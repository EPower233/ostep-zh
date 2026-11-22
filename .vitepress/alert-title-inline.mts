import type MarkdownIt from 'markdown-it'

export default function alertTitleInline(md: MarkdownIt) {
  const renderAlert = md.renderer.rules.github_alert_open
  if (!renderAlert) return

  md.renderer.rules.github_alert_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index]
    const title = token.meta?.title
    if (typeof title !== 'string') return renderAlert(tokens, index, options, env, renderer)

    // A nested inline render must not append the document's footnote block.
    token.meta.title = md.renderInline(title, { ...env, footnotes: undefined })
    try {
      return renderAlert(tokens, index, options, env, renderer)
    } finally {
      token.meta.title = title
    }
  }
}
