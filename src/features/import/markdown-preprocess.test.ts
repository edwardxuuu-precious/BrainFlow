import { describe, expect, it } from 'vitest'
import { preprocessMarkdownToImportTree } from './markdown-preprocess'

describe('preprocessMarkdownToImportTree', () => {
  it('maps headings into nested nodes and preserves markdown block content', () => {
    const tree = preprocessMarkdownToImportTree(`# Launch

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

    expect(tree).toHaveLength(1)
    expect(tree[0].title).toBe('Launch')
    expect(tree[0].blocks.map((block) => block.type)).toEqual(['paragraph', 'bullet_list'])
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].title).toBe('Risks')
    expect(tree[0].children[0].blocks.map((block) => block.type)).toEqual([
      'blockquote',
      'code_block',
      'table',
    ])
    expect(tree[0].children[0].blocks[2].rows).toEqual([
      ['Name', 'Value'],
      ['KPI', '42'],
    ])
  })

  it('creates a fallback root section when markdown starts without a heading', () => {
    const tree = preprocessMarkdownToImportTree(`Paragraph only

- todo`)

    expect(tree).toHaveLength(1)
    expect(tree[0].title).toBe('导入内容')
    expect(tree[0].blocks).toHaveLength(2)
  })
})
