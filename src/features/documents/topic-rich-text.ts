import type {
  TopicRichTextBlock,
  TopicRichTextBulletListBlock,
  TopicRichTextDocument,
  TopicRichTextListItem,
  TopicRichTextParagraphBlock,
  TopicRichTextTextRun,
} from './types'

interface ActiveTextMarks {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  link?: string
}

const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'li'])

function normalizeRichTextValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : ''
}

function normalizeLink(link: string | null | undefined): string | undefined {
  if (typeof link !== 'string') {
    return undefined
  }

  const trimmed = link.trim()
  return trimmed || undefined
}

function sameRunFormatting(
  left: TopicRichTextTextRun,
  right: TopicRichTextTextRun,
): boolean {
  return (
    !!left.bold === !!right.bold &&
    !!left.italic === !!right.italic &&
    !!left.underline === !!right.underline &&
    (left.link ?? '') === (right.link ?? '')
  )
}

function mergeAdjacentRuns(runs: TopicRichTextTextRun[]): TopicRichTextTextRun[] {
  const merged: TopicRichTextTextRun[] = []

  for (const run of runs) {
    if (!run.text) {
      continue
    }

    const previous = merged.at(-1)
    if (previous && sameRunFormatting(previous, run)) {
      previous.text += run.text
      continue
    }

    merged.push({ ...run })
  }

  return merged
}

function normalizeRun(run: Partial<TopicRichTextTextRun> | null | undefined): TopicRichTextTextRun | null {
  const text = normalizeRichTextValue(run?.text)
  if (!text) {
    return null
  }

  return {
    text,
    bold: run?.bold === true ? true : undefined,
    italic: run?.italic === true ? true : undefined,
    underline: run?.underline === true ? true : undefined,
    link: normalizeLink(run?.link),
  }
}

function normalizeListItem(item: Partial<TopicRichTextListItem> | null | undefined): TopicRichTextListItem | null {
  const children = mergeAdjacentRuns((item?.children ?? []).map(normalizeRun).filter((run): run is TopicRichTextTextRun => !!run))
  if (children.length === 0) {
    return null
  }

  return { children }
}

function normalizeBlock(block: Partial<TopicRichTextBlock> | null | undefined): TopicRichTextBlock | null {
  if (!block || typeof block !== 'object') {
    return null
  }

  if (block.type === 'paragraph') {
    const children = mergeAdjacentRuns((block.children ?? []).map(normalizeRun).filter((run): run is TopicRichTextTextRun => !!run))
    if (children.length === 0) {
      return null
    }

    return {
      type: 'paragraph',
      children,
    }
  }

  if (block.type === 'bullet_list') {
    const items = (block.items ?? [])
      .map(normalizeListItem)
      .filter((item): item is TopicRichTextListItem => !!item)

    if (items.length === 0) {
      return null
    }

    return {
      type: 'bullet_list',
      items,
    }
  }

  return null
}

function createParagraphBlock(text: string): TopicRichTextParagraphBlock {
  return {
    type: 'paragraph',
    children: [{ text }],
  }
}

function createBulletListBlock(items: string[]): TopicRichTextBulletListBlock {
  return {
    type: 'bullet_list',
    items: items.map((item) => ({
      children: [{ text: item }],
    })),
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderRun(run: TopicRichTextTextRun): string {
  let content = escapeHtml(run.text).replaceAll('\n', '<br>')

  if (run.bold) {
    content = `<strong>${content}</strong>`
  }

  if (run.italic) {
    content = `<em>${content}</em>`
  }

  if (run.underline) {
    content = `<u>${content}</u>`
  }

  if (run.link) {
    content = `<a href="${escapeHtml(run.link)}" rel="noreferrer" target="_blank">${content}</a>`
  }

  return content
}

function renderRuns(runs: TopicRichTextTextRun[]): string {
  if (runs.length === 0) {
    return '<br>'
  }

  return runs.map(renderRun).join('')
}

function pushTextRun(
  runs: TopicRichTextTextRun[],
  text: string,
  marks: ActiveTextMarks,
): void {
  if (!text) {
    return
  }

  const nextRun: TopicRichTextTextRun = {
    text,
    bold: marks.bold ? true : undefined,
    italic: marks.italic ? true : undefined,
    underline: marks.underline ? true : undefined,
    link: marks.link,
  }

  const previous = runs.at(-1)
  if (previous && sameRunFormatting(previous, nextRun)) {
    previous.text += nextRun.text
    return
  }

  runs.push(nextRun)
}

function parseInlineNodes(nodes: Node[], marks: ActiveTextMarks = {}): TopicRichTextTextRun[] {
  const runs: TopicRichTextTextRun[] = []

  for (const node of nodes) {
    if (node.nodeType === node.TEXT_NODE) {
      pushTextRun(runs, normalizeRichTextValue(node.textContent), marks)
      continue
    }

    if (!(node instanceof HTMLElement)) {
      continue
    }

    const tag = node.tagName.toLowerCase()
    if (tag === 'br') {
      pushTextRun(runs, '\n', marks)
      continue
    }

    const nextMarks: ActiveTextMarks = { ...marks }
    if (tag === 'strong' || tag === 'b') {
      nextMarks.bold = true
    }
    if (tag === 'em' || tag === 'i') {
      nextMarks.italic = true
    }
    if (tag === 'u') {
      nextMarks.underline = true
    }
    if (tag === 'a') {
      nextMarks.link = normalizeLink(node.getAttribute('href'))
    }

    for (const childRun of parseInlineNodes(Array.from(node.childNodes), nextMarks)) {
      pushTextRun(runs, childRun.text, childRun)
    }
  }

  return mergeAdjacentRuns(runs)
}

function normalizeParagraphText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
}

function parseParagraphFromNodes(nodes: Node[]): TopicRichTextParagraphBlock | null {
  const children = mergeAdjacentRuns(parseInlineNodes(nodes).map((run) => ({
    ...run,
    text: normalizeParagraphText(run.text),
  }))).filter((run) => run.text.length > 0)

  if (children.length === 0 || extractPlainTextFromRuns(children).trim().length === 0) {
    return null
  }

  return {
    type: 'paragraph',
    children,
  }
}

function parseBulletList(element: HTMLElement): TopicRichTextBulletListBlock | null {
  const items = Array.from(element.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName.toLowerCase() === 'li')
    .map((item) => normalizeListItem({ children: parseInlineNodes(Array.from(item.childNodes)) }))
    .filter((item): item is TopicRichTextListItem => !!item)

  if (items.length === 0) {
    return null
  }

  return {
    type: 'bullet_list',
    items,
  }
}

function extractPlainTextFromRuns(runs: TopicRichTextTextRun[]): string {
  return runs.map((run) => run.text).join('')
}

function normalizeTopicNotePreviewSource(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createPlainParagraphRichText(text: string): TopicRichTextDocument | null {
  const normalized = normalizeRichTextValue(text)
  if (normalized.trim().length === 0) {
    return null
  }

  return {
    version: 1,
    blocks: [createParagraphBlock(normalized)],
  }
}

export function createTopicRichTextFromPlainText(text: string): TopicRichTextDocument | null {
  const normalized = normalizeRichTextValue(text)
  if (normalized.trim().length === 0) {
    return null
  }

  const lines = normalized.split('\n')
  const blocks: TopicRichTextBlock[] = []
  let index = 0

  while (index < lines.length) {
    while (index < lines.length && lines[index].trim().length === 0) {
      index += 1
    }

    if (index >= lines.length) {
      break
    }

    if (/^\s*[-*]\s+/.test(lines[index])) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, '').trimEnd())
        index += 1
      }
      blocks.push(createBulletListBlock(items))
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !/^\s*[-*]\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trimEnd())
      index += 1
    }
    blocks.push(createParagraphBlock(paragraphLines.join('\n')))
  }

  return normalizeTopicRichText({ version: 1, blocks })
}

export function getRenderableTopicRichText(
  noteRich: TopicRichTextDocument | null | undefined,
  note: string,
): TopicRichTextDocument | null {
  return normalizeTopicRichText(noteRich) ?? createTopicRichTextFromPlainText(note)
}

export function getTopicNotePreview(
  noteRich: TopicRichTextDocument | null | undefined,
  note: string,
  maxLength = 96,
): string {
  const plainText = extractPlainTextFromTopicRichText(noteRich)
  const normalized = normalizeTopicNotePreviewSource(plainText || note)

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`
}

export function normalizeTopicRichText(value: unknown): TopicRichTextDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const raw = value as {
    version?: unknown
    blocks?: unknown
  }

  if (raw.version !== 1 || !Array.isArray(raw.blocks)) {
    return null
  }

  const blocks = raw.blocks
    .map((block) => normalizeBlock(block as Partial<TopicRichTextBlock>))
    .filter((block): block is TopicRichTextBlock => !!block)

  if (blocks.length === 0) {
    return null
  }

  return {
    version: 1,
    blocks,
  }
}

export function extractPlainTextFromTopicRichText(noteRich: TopicRichTextDocument | null | undefined): string {
  const normalized = normalizeTopicRichText(noteRich)
  if (!normalized) {
    return ''
  }

  return normalized.blocks
    .map((block) => {
      if (block.type === 'paragraph') {
        return extractPlainTextFromRuns(block.children)
      }

      return block.items
        .map((item) => `- ${extractPlainTextFromRuns(item.children)}`)
        .join('\n')
    })
    .join('\n\n')
}

export function isTopicRichTextEmpty(noteRich: TopicRichTextDocument | null | undefined): boolean {
  return extractPlainTextFromTopicRichText(noteRich).trim().length === 0
}

export function topicRichTextToHtml(noteRich: TopicRichTextDocument | null | undefined): string {
  const normalized = normalizeTopicRichText(noteRich)
  if (!normalized) {
    return '<p><br></p>'
  }

  return normalized.blocks
    .map((block) => {
      if (block.type === 'paragraph') {
        return `<p>${renderRuns(block.children)}</p>`
      }

      return `<ul>${block.items.map((item) => `<li>${renderRuns(item.children)}</li>`).join('')}</ul>`
    })
    .join('')
}

export function parseTopicRichTextFromHtml(html: string): TopicRichTextDocument | null {
  const container = document.createElement('div')
  container.innerHTML = html

  const childElements = Array.from(container.children)
  const hasBlockElements = childElements.some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()))
  const blocks: TopicRichTextBlock[] = []

  if (!hasBlockElements) {
    const paragraph = parseParagraphFromNodes(Array.from(container.childNodes))
    if (paragraph) {
      blocks.push(paragraph)
    }
  } else {
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === node.TEXT_NODE) {
        const paragraph = parseParagraphFromNodes([node])
        if (paragraph) {
          blocks.push(paragraph)
        }
        continue
      }

      if (!(node instanceof HTMLElement)) {
        continue
      }

      const tag = node.tagName.toLowerCase()
      if (tag === 'ul' || tag === 'ol') {
        const list = parseBulletList(node)
        if (list) {
          blocks.push(list)
        }
        continue
      }

      const paragraph = parseParagraphFromNodes(Array.from(node.childNodes))
      if (paragraph) {
        blocks.push(paragraph)
      }
    }
  }

  return normalizeTopicRichText({ version: 1, blocks })
}
