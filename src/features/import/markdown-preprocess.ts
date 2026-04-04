import { toString } from 'mdast-util-to-string'
import type { Code, Content, Heading, List, ListItem, Root, Table } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import type {
  MarkdownImportBlockType,
  MarkdownImportPreprocessedBlock,
  MarkdownImportPreprocessedNode,
} from '../../../shared/ai-contract'

interface MutableImportNode {
  id: string
  title: string
  level: number
  sourcePath: string[]
  blocks: MarkdownImportPreprocessedBlock[]
  children: MutableImportNode[]
}

function createNodeId(prefix: string): string {
  return `md_${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim()
}

function ensureSectionTarget(
  roots: MutableImportNode[],
  stack: MutableImportNode[],
): MutableImportNode {
  const current = stack.at(-1)
  if (current) {
    return current
  }

  let fallback = roots.find((node) => node.level === 0 && node.title === '导入内容')
  if (!fallback) {
    fallback = {
      id: createNodeId('section'),
      title: '导入内容',
      level: 0,
      sourcePath: [],
      blocks: [],
      children: [],
    }
    roots.push(fallback)
  }

  return fallback
}

function normalizeHeadingTitle(node: Heading): string {
  const title = normalizeLineBreaks(toString(node))
  return title || `标题 ${node.depth}`
}

function createBlock(
  type: MarkdownImportBlockType,
  text: string,
  raw: string,
  extras?: Partial<MarkdownImportPreprocessedBlock>,
): MarkdownImportPreprocessedBlock {
  return {
    type,
    text: normalizeLineBreaks(text),
    raw: normalizeLineBreaks(raw),
    ...extras,
  }
}

function formatTable(node: Table): { text: string; rows: string[][] } {
  const rows = node.children.map((row) =>
    row.children.map((cell) => normalizeLineBreaks(toString(cell))),
  )

  return {
    text: rows.map((cells) => cells.join(' | ')).join('\n'),
    rows,
  }
}

function formatListItem(item: ListItem): string {
  return normalizeLineBreaks(toString(item))
}

function convertListBlock(node: List): MarkdownImportPreprocessedBlock {
  const items = node.children.map(formatListItem)
  const checked = node.children.map((item) =>
    typeof item.checked === 'boolean' ? item.checked : false,
  )
  const hasTaskState = node.children.some((item) => typeof item.checked === 'boolean')

  return createBlock(
    hasTaskState ? 'task_list' : node.ordered ? 'ordered_list' : 'bullet_list',
    items.join('\n'),
    items
      .map((item, index) => {
        if (hasTaskState) {
          return `- [${checked[index] ? 'x' : ' '}] ${item}`
        }
        return `${node.ordered ? `${index + 1}.` : '-'} ${item}`
      })
      .join('\n'),
    {
      items,
      checked: hasTaskState ? checked : undefined,
    },
  )
}

function convertBlock(node: Content): MarkdownImportPreprocessedBlock | null {
  switch (node.type) {
    case 'paragraph':
      return createBlock('paragraph', toString(node), toString(node))
    case 'list':
      return convertListBlock(node)
    case 'blockquote':
      return createBlock(
        'blockquote',
        toString(node),
        toString(node)
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n'),
      )
    case 'code': {
      const codeNode = node as Code
      return createBlock(
        'code_block',
        codeNode.value,
        `\`\`\`${codeNode.lang ?? ''}\n${codeNode.value}\n\`\`\``,
        {
          language: codeNode.lang ?? null,
        },
      )
    }
    case 'table': {
      const table = formatTable(node)
      return createBlock('table', table.text, table.text, {
        rows: table.rows,
      })
    }
    default:
      return null
  }
}

function finalizeSourcePath(nodes: MutableImportNode[], parentPath: string[] = []): MarkdownImportPreprocessedNode[] {
  return nodes.map((node) => {
    const sourcePath = [...parentPath, node.title]
    return {
      id: node.id,
      title: node.title,
      level: node.level,
      sourcePath,
      blocks: node.blocks,
      children: finalizeSourcePath(node.children, sourcePath),
    }
  })
}

export function preprocessMarkdownToImportTree(markdown: string): MarkdownImportPreprocessedNode[] {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n')
  const root = unified().use(remarkParse).use(remarkGfm).parse(normalizedMarkdown) as Root
  const sections: MutableImportNode[] = []
  const stack: MutableImportNode[] = []

  for (const child of root.children) {
    if (child.type === 'heading') {
      const heading = child as Heading
      const nextNode: MutableImportNode = {
        id: createNodeId('section'),
        title: normalizeHeadingTitle(heading),
        level: heading.depth,
        sourcePath: [],
        blocks: [],
        children: [],
      }

      while (stack.length > 0 && stack[stack.length - 1].level >= heading.depth) {
        stack.pop()
      }

      const parent = stack.at(-1)
      if (parent) {
        parent.children.push(nextNode)
      } else {
        sections.push(nextNode)
      }
      stack.push(nextNode)
      continue
    }

    const block = convertBlock(child)
    if (!block) {
      continue
    }

    ensureSectionTarget(sections, stack).blocks.push(block)
  }

  return finalizeSourcePath(sections)
}

export function collectMarkdownImportBlockCount(tree: MarkdownImportPreprocessedNode[]): number {
  let count = 0
  for (const node of tree) {
    count += node.blocks.length + collectMarkdownImportBlockCount(node.children)
  }
  return count
}

export function collectMarkdownHeadings(markdown: string): string[] {
  const headings: string[] = []
  const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root

  visit(root, 'heading', (node) => {
    headings.push(normalizeHeadingTitle(node as Heading))
  })

  return headings
}
