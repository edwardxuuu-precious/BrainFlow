import type { TextImportPreprocessHint, TextImportHintKind } from '../../../shared/ai-contract'

const FALLBACK_SOURCE_PATH = ['导入内容']

function createHintId(prefix: string): string {
  return `text_${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function normalizeInlineText(value: string): string {
  return normalizeLineBreaks(value).trim()
}

function createHint(
  kind: TextImportHintKind,
  raw: string,
  lineStart: number,
  lineEnd: number,
  extras?: Partial<TextImportPreprocessHint>,
): TextImportPreprocessHint {
  return {
    id: createHintId(kind),
    kind,
    text: normalizeInlineText(extras?.text ?? raw),
    raw: normalizeLineBreaks(raw).trim(),
    level: extras?.level ?? 0,
    lineStart,
    lineEnd,
    sourcePath: extras?.sourcePath ?? FALLBACK_SOURCE_PATH,
    language: extras?.language ?? null,
    items: extras?.items,
    checked: extras?.checked,
    rows: extras?.rows,
  }
}

function stripLeadingDecoration(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^-\s\[[ xX]\]\s+/, '')
    .trim()
}

function deriveSourcePath(
  headings: Array<{ level: number; title: string }>,
  fallbackTitle: string,
): string[] {
  if (headings.length === 0) {
    return [fallbackTitle]
  }

  return headings.map((heading) => heading.title)
}

function parseTableRows(lines: string[]): string[][] {
  return lines
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((row) => row.some((cell) => cell.length > 0))
}

export function preprocessTextToImportHints(rawText: string): TextImportPreprocessHint[] {
  const normalized = normalizeLineBreaks(rawText)
  const lines = normalized.split('\n')
  const hints: TextImportPreprocessHint[] = []
  const headingStack: Array<{ level: number; title: string }> = []

  let index = 0
  while (index < lines.length) {
    const currentLine = lines[index]
    const trimmed = currentLine.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = normalizeInlineText(headingMatch[2])
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop()
      }
      headingStack.push({ level, title })
      hints.push(
        createHint('heading', currentLine, index + 1, index + 1, {
          text: title,
          level,
          sourcePath: deriveSourcePath(headingStack, title),
        }),
      )
      index += 1
      continue
    }

    const fenceMatch = trimmed.match(/^(```|~~~)(.*)$/)
    if (fenceMatch) {
      const fence = fenceMatch[1]
      const language = normalizeInlineText(fenceMatch[2]) || null
      const start = index
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        index += 1
      }
      if (index < lines.length) {
        index += 1
      }
      const blockLines = lines.slice(start, index)
      const raw = blockLines.join('\n')
      hints.push(
        createHint('code_block', raw, start + 1, index, {
          text: blockLines
            .slice(1, blockLines.length > 1 ? -1 : undefined)
            .join('\n')
            .trim(),
          sourcePath: deriveSourcePath(headingStack, '导入内容'),
          language,
        }),
      )
      continue
    }

    if (trimmed.startsWith('>')) {
      const start = index
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        index += 1
      }
      const blockLines = lines.slice(start, index)
      const text = blockLines.map((line) => line.replace(/^\s*>\s?/, '')).join('\n')
      hints.push(
        createHint('blockquote', blockLines.join('\n'), start + 1, index, {
          text,
          sourcePath: deriveSourcePath(headingStack, '导入内容'),
        }),
      )
      continue
    }

    const taskItems: string[] = []
    const taskChecked: boolean[] = []
    let taskIndex = index
    while (taskIndex < lines.length) {
      const match = lines[taskIndex].trim().match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/)
      if (!match) {
        break
      }
      taskChecked.push(match[1].toLowerCase() === 'x')
      taskItems.push(match[2].trim())
      taskIndex += 1
    }
    if (taskItems.length > 0) {
      hints.push(
        createHint('task_list', lines.slice(index, taskIndex).join('\n'), index + 1, taskIndex, {
          text: taskItems.join('\n'),
          sourcePath: deriveSourcePath(headingStack, '导入内容'),
          items: taskItems,
          checked: taskChecked,
        }),
      )
      index = taskIndex
      continue
    }

    const bulletItems: string[] = []
    let bulletIndex = index
    while (bulletIndex < lines.length) {
      const match = lines[bulletIndex].trim().match(/^[-*+]\s+(.+)$/)
      if (!match || /^\[[ xX]\]/.test(match[1])) {
        break
      }
      bulletItems.push(match[1].trim())
      bulletIndex += 1
    }
    if (bulletItems.length > 0) {
      hints.push(
        createHint('bullet_list', lines.slice(index, bulletIndex).join('\n'), index + 1, bulletIndex, {
          text: bulletItems.join('\n'),
          sourcePath: deriveSourcePath(headingStack, '导入内容'),
          items: bulletItems,
        }),
      )
      index = bulletIndex
      continue
    }

    const orderedItems: string[] = []
    let orderedIndex = index
    while (orderedIndex < lines.length) {
      const match = lines[orderedIndex].trim().match(/^\d+[.)]\s+(.+)$/)
      if (!match) {
        break
      }
      orderedItems.push(match[1].trim())
      orderedIndex += 1
    }
    if (orderedItems.length > 0) {
      hints.push(
        createHint(
          'ordered_list',
          lines.slice(index, orderedIndex).join('\n'),
          index + 1,
          orderedIndex,
          {
            text: orderedItems.join('\n'),
            sourcePath: deriveSourcePath(headingStack, '导入内容'),
            items: orderedItems,
          },
        ),
      )
      index = orderedIndex
      continue
    }

    if (trimmed.includes('|')) {
      const tableLines: string[] = []
      let tableIndex = index
      while (tableIndex < lines.length && lines[tableIndex].includes('|')) {
        tableLines.push(lines[tableIndex])
        tableIndex += 1
      }
      if (tableLines.length >= 2) {
        const rows = parseTableRows(tableLines)
        hints.push(
          createHint('table', tableLines.join('\n'), index + 1, tableIndex, {
            text: rows.map((row) => row.join(' | ')).join('\n'),
            sourcePath: deriveSourcePath(headingStack, '导入内容'),
            rows,
          }),
        )
        index = tableIndex
        continue
      }
    }

    const start = index
    while (index < lines.length) {
      const line = lines[index]
      const lineTrimmed = line.trim()
      if (!lineTrimmed) {
        break
      }
      if (
        /^(#{1,6})\s+/.test(lineTrimmed) ||
        /^(```|~~~)/.test(lineTrimmed) ||
        /^>\s?/.test(lineTrimmed) ||
        /^[-*+]\s+\[([ xX])\]\s+/.test(lineTrimmed) ||
        /^[-*+]\s+/.test(lineTrimmed) ||
        /^\d+[.)]\s+/.test(lineTrimmed)
      ) {
        break
      }
      index += 1
    }

    const paragraphLines = lines.slice(start, index)
    const paragraphText = paragraphLines.map(stripLeadingDecoration).join('\n').trim()
    if (paragraphText) {
      hints.push(
        createHint('paragraph', paragraphLines.join('\n'), start + 1, index, {
          text: paragraphText,
          sourcePath: deriveSourcePath(headingStack, '导入内容'),
        }),
      )
      continue
    }

    index += 1
  }

  return hints
}

export function countTextImportHints(hints: TextImportPreprocessHint[]): number {
  return hints.length
}

export function deriveTextImportTitle(sourceName: string, rawText: string): string {
  const normalizedSourceName = normalizeInlineText(sourceName).replace(/\.[^.]+$/, '')
  if (normalizedSourceName) {
    return normalizedSourceName
  }

  const firstLine = normalizeLineBreaks(rawText)
    .split('\n')
    .map((line) => stripLeadingDecoration(line))
    .find((line) => line.trim().length > 0)

  return firstLine?.slice(0, 48) || '导入内容'
}
