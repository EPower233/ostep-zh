import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

type Token = {
  type: string
  content: string
  children: Token[] | null
  attrGet(name: string): string | null
  attrSet(name: string, value: string): void
}

type RenderEnv = { path?: string; realPath?: string; indexingHeadings?: boolean }
type State = { tokens: Token[]; env: RenderEnv }
type Markdown = {
  parse(source: string, env: RenderEnv): Token[]
  core: { ruler: { push(name: string, rule: (state: State) => void): void } }
}

function headingKey(text: string) {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

function indexHeadings(tokens: Token[]) {
  const ids = new Set<string>()
  const titles = new Map<string, string | null>()
  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'heading_open') continue
    const id = token.attrGet('id')
    if (!id) continue
    ids.add(id)
    const inline = tokens[index + 1]
    const children = inline.children?.filter(child => !child.attrGet('class')?.includes('header-anchor')) ?? []
    const title = children
      .filter(child => child.type === 'text' || child.type === 'code_inline')
      .map(child => child.content)
      .join('')
    for (const key of new Set([headingKey(title), headingKey(inline.content)])) {
      if (key) titles.set(key, titles.has(key) ? null : id)
    }
  }
  return { ids, titles }
}

export default function headingLinks(md: Markdown, root: string) {
  const headings = new Map<string, { mtime: number; index: ReturnType<typeof indexHeadings> }>()

  md.core.ruler.push('resolve_heading_links', ({ tokens, env }) => {
    const source = env.realPath ?? env.path
    if (env.indexingHeadings || !source) return
    const current = indexHeadings(tokens)

    for (const { children } of tokens) {
      for (const token of children ?? []) {
        if (token.type !== 'link_open') continue
        const href = token.attrGet('href')
        const hash = href?.indexOf('#') ?? -1
        if (!href || hash < 0 || hash === href.length - 1 || /^(?:[\w+.-]+:|\/\/)/.test(href)) continue
        const rawPath = href.slice(0, hash).split('?')[0]
        let fragment: string
        let path: string
        try {
          fragment = decodeURIComponent(href.slice(hash + 1))
          path = decodeURIComponent(rawPath)
        } catch {
          continue
        }

        let target = current
        if (path) {
          const markdownPath = path.replace(/\.html$/, '.md')
          if (!markdownPath.endsWith('.md')) continue
          const file = path.startsWith('/') ? resolve(root, '.' + markdownPath) : resolve(dirname(source), markdownPath)
          const withinRoot = relative(root, file)
          if (withinRoot.startsWith('..') || isAbsolute(withinRoot)) continue
          if (!existsSync(file)) continue
          const mtime = statSync(file).mtimeMs
          const cached = headings.get(file)
          if (cached?.mtime === mtime) {
            target = cached.index
          } else {
            target = indexHeadings(md.parse(readFileSync(file, 'utf8'), {
              path: file,
              realPath: file,
              indexingHeadings: true,
            }))
            headings.set(file, { mtime, index: target })
          }
        }

        if (target.ids.has(fragment)) continue
        const id = target.titles.get(headingKey(fragment))
        if (id) token.attrSet('href', href.slice(0, hash + 1) + encodeURIComponent(id))
      }
    }
  })
}
