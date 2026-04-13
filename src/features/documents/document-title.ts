export const DEFAULT_DOCUMENT_TITLE = '未命名脑图'
export const MAX_DOCUMENT_TITLE_LENGTH = 50
export const DOCUMENT_TITLE_BRAND_PREFIX = 'FLOW - '
export const DUPLICATE_TITLE_SUFFIX_PATTERN = /\s*\((\d+)\)$/

function stripDocumentBrandPrefix(rawTitle: string): string {
  let nextTitle = rawTitle.trim()

  while (nextTitle.startsWith(DOCUMENT_TITLE_BRAND_PREFIX)) {
    nextTitle = nextTitle.slice(DOCUMENT_TITLE_BRAND_PREFIX.length).trimStart()
  }

  return nextTitle
}

export function normalizeDocumentTitle(title: string | null | undefined): string {
  const normalized = typeof title === 'string' ? stripDocumentBrandPrefix(title) : ''
  const trimmed = normalized.trim().slice(0, MAX_DOCUMENT_TITLE_LENGTH).trim()
  return trimmed || DEFAULT_DOCUMENT_TITLE
}

export function buildDerivedDocumentTitle(baseTitle: string | null | undefined, suffix: string): string {
  const normalizedBaseTitle = normalizeDocumentTitle(baseTitle)
  const maxBaseLength = Math.max(0, MAX_DOCUMENT_TITLE_LENGTH - suffix.length)
  const trimmedBaseTitle = normalizedBaseTitle.slice(0, maxBaseLength).trimEnd()
  const safeBaseTitle = trimmedBaseTitle || DEFAULT_DOCUMENT_TITLE.slice(0, maxBaseLength).trimEnd()
  return normalizeDocumentTitle(`${safeBaseTitle}${suffix}`)
}

export function buildDocumentWindowTitle(title: string | null | undefined): string {
  return `${DOCUMENT_TITLE_BRAND_PREFIX}${normalizeDocumentTitle(title)}`
}

/**
 * 从标题中提取基础名称（去除序号后缀）
 * 例如："测试1 (2)" -> "测试1"
 */
function extractBaseTitle(title: string): string {
  return title.replace(DUPLICATE_TITLE_SUFFIX_PATTERN, '').trim()
}

/**
 * 生成唯一的文档标题
 * @param desiredTitle 用户期望的标题
 * @param existingTitles 所有已存在的标题列表
 * @returns 唯一的标题（如果 desiredTitle 已存在，则自动添加序号）
 */
export function generateUniqueTitle(desiredTitle: string | null | undefined, existingTitles: string[]): string {
  const normalizedDesired = normalizeDocumentTitle(desiredTitle)
  
  // 规范化所有现有标题以便比较
  const normalizedExistingTitles = existingTitles.map(t => normalizeDocumentTitle(t))
  
  // 如果没有重复，直接返回
  if (!normalizedExistingTitles.includes(normalizedDesired)) {
    return normalizedDesired
  }
  
  // 提取基础标题（去除已有的序号后缀）
  const baseTitle = extractBaseTitle(normalizedDesired)
  
  // 查找该基础标题的所有变体，找出最大序号
  let maxIndex = 1
  const baseTitlePattern = new RegExp(`^${escapeRegExp(baseTitle)}\\s*\\((\\d+)\\)$`)
  
  for (const existingTitle of normalizedExistingTitles) {
    if (existingTitle === baseTitle) {
      maxIndex = Math.max(maxIndex, 1)
    } else {
      const match = existingTitle.match(baseTitlePattern)
      if (match) {
        maxIndex = Math.max(maxIndex, parseInt(match[1], 10))
      }
    }
  }
  
  // 生成新标题：基础标题 + (序号+1)
  const suffix = ` (${maxIndex + 1})`
  const maxBaseLength = Math.max(0, MAX_DOCUMENT_TITLE_LENGTH - suffix.length)
  const trimmedBaseTitle = baseTitle.slice(0, maxBaseLength).trimEnd()
  
  return `${trimmedBaseTitle}${suffix}`
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 检查标题是否会导致重复
 * @param title 要检查的标题
 * @param existingTitles 已存在的标题列表
 * @param excludeTitle 要排除的标题（用于重命名时排除自身）
 * @returns 是否重复
 */
export function isTitleDuplicate(
  title: string | null | undefined,
  existingTitles: string[],
  excludeTitle?: string | null
): boolean {
  const normalizedTitle = normalizeDocumentTitle(title)
  const filteredTitles = excludeTitle 
    ? existingTitles.filter(t => t !== excludeTitle)
    : existingTitles
  return filteredTitles.includes(normalizedTitle)
}
