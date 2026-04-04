import { describe, expect, it } from 'vitest'
import { preprocessTextToImportHints } from './text-import-preprocess'

describe('preprocessTextToImportHints', () => {
  it('extracts markdown-like structural hints without requiring a markdown schema', () => {
    const hints = preprocessTextToImportHints(`# Launch

Intro paragraph

- Item A
- Item B

## Risks

> Keep rollback ready

\`\`\`ts
console.log('ship')
\`\`\`

| Name | Value |
| --- | --- |
| KPI | 42 |
`)

    expect(hints.map((hint) => hint.kind)).toEqual([
      'heading',
      'paragraph',
      'bullet_list',
      'heading',
      'blockquote',
      'code_block',
      'table',
    ])
    expect(hints[0]).toMatchObject({
      kind: 'heading',
      text: 'Launch',
      level: 1,
      sourcePath: ['Launch'],
    })
    expect(hints[6].rows).toEqual([
      ['Name', 'Value'],
      ['---', '---'],
      ['KPI', '42'],
    ])
  })

  it('handles plain text and numbered notes as generic import hints', () => {
    const hints = preprocessTextToImportHints(`Weekly sync

1. Follow up with sales
2. Finalize pricing

Loose paragraph notes here.`)

    expect(hints.map((hint) => hint.kind)).toEqual(['paragraph', 'ordered_list', 'paragraph'])
    expect(hints[1].items).toEqual(['Follow up with sales', 'Finalize pricing'])
  })
})
