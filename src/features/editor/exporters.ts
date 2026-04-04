import type { MindMapDocument } from '../documents/types'

function sanitizeFileName(name: string): string {
  const sanitized = Array.from(name)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return !('<>:"/\\|?*'.includes(character) || code < 32)
    })
    .join('')
    .trim()

  return sanitized || 'brainflow'
}

function triggerDownload(href: string, fileName: string): void {
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  link.click()
}

export function exportDocumentAsJson(doc: MindMapDocument): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, `${sanitizeFileName(doc.title)}.json`)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function exportCanvasAsPng(
  element: HTMLElement,
  doc: MindMapDocument,
  prepare?: () => Promise<void>,
): Promise<void> {
  const { toPng } = await import('html-to-image')

  if (prepare) {
    await prepare()
  }

  await new Promise((resolve) => window.setTimeout(resolve, 240))
  const url = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: doc.theme.canvas,
  })
  triggerDownload(url, `${sanitizeFileName(doc.title)}.png`)
}
