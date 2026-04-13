import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DOCUMENT_TITLE,
  MAX_DOCUMENT_TITLE_LENGTH,
  buildDerivedDocumentTitle,
  buildDocumentWindowTitle,
  generateUniqueTitle,
  isTitleDuplicate,
  normalizeDocumentTitle,
} from './document-title'

describe('document title helpers', () => {
  it('removes repeated FLOW prefixes from persisted titles', () => {
    expect(normalizeDocumentTitle('FLOW - FLOW - 项目计划')).toBe('项目计划')
  })

  it('falls back to the default title for blank input', () => {
    expect(normalizeDocumentTitle('   ')).toBe(DEFAULT_DOCUMENT_TITLE)
  })

  it('truncates normalized titles to 50 characters', () => {
    const longTitle = 'A'.repeat(MAX_DOCUMENT_TITLE_LENGTH + 12)
    expect(normalizeDocumentTitle(longTitle)).toBe('A'.repeat(MAX_DOCUMENT_TITLE_LENGTH))
  })

  it('keeps derived copy titles within the max length', () => {
    const longTitle = 'B'.repeat(MAX_DOCUMENT_TITLE_LENGTH)
    const duplicateTitle = buildDerivedDocumentTitle(longTitle, ' 副本')
    const importedCopyTitle = buildDerivedDocumentTitle(longTitle, '（导入副本）')

    expect(duplicateTitle).toHaveLength(MAX_DOCUMENT_TITLE_LENGTH)
    expect(importedCopyTitle).toHaveLength(MAX_DOCUMENT_TITLE_LENGTH)
    expect(duplicateTitle.endsWith(' 副本')).toBe(true)
    expect(importedCopyTitle.endsWith('（导入副本）')).toBe(true)
  })

  it('builds the browser title from the normalized document title', () => {
    expect(buildDocumentWindowTitle('FLOW - Canvas title')).toBe('FLOW - Canvas title')
  })

  describe('generateUniqueTitle', () => {
    it('returns the original title if no duplicates exist', () => {
      const existingTitles = ['文档A', '文档B']
      expect(generateUniqueTitle('新文档', existingTitles)).toBe('新文档')
    })

    it('adds (2) suffix when the title already exists', () => {
      const existingTitles = ['测试文档']
      expect(generateUniqueTitle('测试文档', existingTitles)).toBe('测试文档 (2)')
    })

    it('increments the suffix for multiple duplicates', () => {
      const existingTitles = ['测试文档', '测试文档 (2)', '测试文档 (3)']
      expect(generateUniqueTitle('测试文档', existingTitles)).toBe('测试文档 (4)')
    })

    it('handles titles that already have numeric suffixes', () => {
      const existingTitles = ['测试文档 (2)']
      expect(generateUniqueTitle('测试文档 (2)', existingTitles)).toBe('测试文档 (3)')
    })

    it('respects max length when adding suffix', () => {
      const longTitle = 'A'.repeat(MAX_DOCUMENT_TITLE_LENGTH)
      const existingTitles = [longTitle]
      const result = generateUniqueTitle(longTitle, existingTitles)
      
      expect(result.length).toBeLessThanOrEqual(MAX_DOCUMENT_TITLE_LENGTH)
      expect(result.endsWith(' (2)')).toBe(true)
    })

    it('handles empty existing titles array', () => {
      expect(generateUniqueTitle('新文档', [])).toBe('新文档')
    })

    it('normalizes the desired title before checking duplicates', () => {
      const existingTitles = ['FLOW - 测试文档']
      expect(generateUniqueTitle('FLOW - FLOW - 测试文档', existingTitles)).toBe('测试文档 (2)')
    })
  })

  describe('isTitleDuplicate', () => {
    it('returns false for unique title', () => {
      const existingTitles = ['文档A', '文档B']
      expect(isTitleDuplicate('文档C', existingTitles)).toBe(false)
    })

    it('returns true for duplicate title', () => {
      const existingTitles = ['文档A', '文档B']
      expect(isTitleDuplicate('文档A', existingTitles)).toBe(true)
    })

    it('returns false when excluding the same title', () => {
      const existingTitles = ['文档A', '文档B']
      expect(isTitleDuplicate('文档A', existingTitles, '文档A')).toBe(false)
    })

    it('normalizes title before checking', () => {
      const existingTitles = ['测试文档']
      expect(isTitleDuplicate('FLOW - 测试文档', existingTitles)).toBe(true)
    })
  })
})
