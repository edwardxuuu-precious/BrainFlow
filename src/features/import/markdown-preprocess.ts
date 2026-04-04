import { preprocessTextToImportHints } from './text-import-preprocess'

export function preprocessMarkdownToImportTree(markdown: string) {
  return preprocessTextToImportHints(markdown)
}

export function collectMarkdownImportBlockCount(tree: Array<{ children?: unknown[] }>) {
  return tree.length
}

export function collectMarkdownHeadings(markdown: string): string[] {
  return preprocessTextToImportHints(markdown)
    .filter((hint) => hint.kind === 'heading')
    .map((hint) => hint.text)
}
