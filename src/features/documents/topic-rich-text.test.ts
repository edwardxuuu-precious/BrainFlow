import { describe, expect, it } from 'vitest'
import {
  createTopicRichTextFromPlainText,
  extractPlainTextFromTopicRichText,
  parseTopicRichTextFromHtml,
  topicRichTextToHtml,
} from './topic-rich-text'

describe('topic-rich-text', () => {
  it('converts plain text with list items into a structured rich document', () => {
    const richNote = createTopicRichTextFromPlainText('第一段\n\n- 事项一\n- 事项二')

    expect(richNote).toEqual({
      version: 1,
      blocks: [
        {
          type: 'paragraph',
          children: [{ text: '第一段' }],
        },
        {
          type: 'bullet_list',
          items: [
            { children: [{ text: '事项一' }] },
            { children: [{ text: '事项二' }] },
          ],
        },
      ],
    })
  })

  it('extracts a compatible plain-text snapshot from a rich note', () => {
    const richNote = parseTopicRichTextFromHtml(
      '<p><strong>重点</strong>说明</p><ul><li>事项一</li><li><a href="https://example.com">事项二</a></li></ul>',
    )

    expect(extractPlainTextFromTopicRichText(richNote)).toBe('重点说明\n\n- 事项一\n- 事项二')
  })

  it('round-trips supported formatting through html serialization', () => {
    const richNote = parseTopicRichTextFromHtml(
      '<p><strong>Bold</strong> <em>Italic</em> <u>Underline</u> <a href="https://example.com">Link</a></p>',
    )

    expect(topicRichTextToHtml(richNote)).toContain('<strong>Bold</strong>')
    expect(topicRichTextToHtml(richNote)).toContain('<em>Italic</em>')
    expect(topicRichTextToHtml(richNote)).toContain('<u>Underline</u>')
    expect(topicRichTextToHtml(richNote)).toContain('href="https://example.com"')
  })
})
