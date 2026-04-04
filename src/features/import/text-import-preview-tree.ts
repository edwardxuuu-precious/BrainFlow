import type { TextImportPreviewItem, TextImportPreviewNode } from '../../../shared/ai-contract'

export function buildTextImportPreviewTree(
  previewNodes: TextImportPreviewItem[],
): TextImportPreviewNode[] {
  const byId = new Map<string, TextImportPreviewNode>()
  const roots: TextImportPreviewNode[] = []

  for (const item of previewNodes) {
    byId.set(item.id, {
      ...item,
      children: [],
    })
  }

  const sorted = [...previewNodes].sort((left, right) => {
    if (left.parentId !== right.parentId) {
      return (left.parentId ?? '').localeCompare(right.parentId ?? '')
    }
    if (left.order !== right.order) {
      return left.order - right.order
    }
    return left.id.localeCompare(right.id)
  })

  for (const item of sorted) {
    const node = byId.get(item.id)
    if (!node) {
      continue
    }

    if (item.parentId) {
      const parent = byId.get(item.parentId)
      if (parent) {
        parent.children.push(node)
        continue
      }
    }

    roots.push(node)
  }

  return roots
}
