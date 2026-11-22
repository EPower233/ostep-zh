import type { MarkdownRenderer } from 'vitepress'

type Token = Parameters<MarkdownRenderer['renderer']['renderToken']>[0][number]

function isProseComparison(tokens: Token[], start: number): boolean {
  let longRows = 0
  let lengths: number[] = []
  for (let i = start + 1; i < tokens.length && tokens[i].type !== 'table_close'; i++) {
    const token = tokens[i]
    if (token.type === 'tr_open') lengths = []
    if (token.type === 'td_open') {
      const text = (tokens[i + 1]?.children ?? []).map(child => child.content).join('')
      lengths.push(text.trim().length)
    }
    if (token.type === 'tr_close' && lengths.length === 2 && lengths.every(length => length >= 40)) {
      longRows++
    }
  }
  return longRows >= 2
}

function isUniformCellGrid(tokens: Token[], start: number): boolean {
  let maxCols = 0
  let rowCols = 0
  let cellCount = 0
  for (let i = start + 1; i < tokens.length && tokens[i].type !== 'table_close'; i++) {
    const token = tokens[i]
    if (token.type === 'tr_open') rowCols = 0
    if (token.type === 'th_open' || token.type === 'td_open') {
      rowCols++
      cellCount++
      const text = (tokens[i + 1]?.children ?? []).map(child => child.content).join('').trim()
      if (text.length > 6) return false
    }
    if (token.type === 'tr_close' && rowCols > maxCols) maxCols = rowCols
  }
  return cellCount >= 4 && maxCols >= 4
}

export default function readableTables(md: MarkdownRenderer) {
  const { renderer } = md
  const open = renderer.rules.table_open
  const close = renderer.rules.table_close
  const htmlBlock = renderer.rules.html_block

  renderer.rules.table_open = (tokens, index, options, env, self) => {
    const table = open?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options)
    let modifiers = ''
    if (isProseComparison(tokens, index)) modifiers += ' book-table--comparison'
    if (isUniformCellGrid(tokens, index)) modifiers += ' book-table--grid'
    return `<div class="book-table${modifiers}">\n${table}`
  }
  renderer.rules.table_close = (tokens, index, options, env, self) => {
    const table = close?.(tokens, index, options, env, self) ?? self.renderToken(tokens, index, options)
    return `${table}</div>\n`
  }
  renderer.rules.html_block = (tokens, index, options, env, self) => {
    const html = htmlBlock?.(tokens, index, options, env, self) ?? tokens[index].content
    return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '<div class="book-table">$&</div>')
  }
}
