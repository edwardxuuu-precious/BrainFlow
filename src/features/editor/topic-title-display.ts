export type TopicTitleKind = 'root' | 'regular'
export type TopicTitleTier = 'large' | 'medium' | 'small'

interface TopicTitleTypographyPreset {
  fontSize: number
  lineHeight: number
  letterSpacing: number
}

export interface TopicTitleTypography extends TopicTitleTypographyPreset {
  kind: TopicTitleKind
  tier: TopicTitleTier
  weightedLength: number
}

export interface TopicTitleMeasurement extends TopicTitleTypography {
  estimatedWidth: number
  lineCount: number
  height: number
}

const ROOT_TITLE_TYPOGRAPHY: Record<TopicTitleTier, TopicTitleTypographyPreset> = {
  large: { fontSize: 32, lineHeight: 1.18, letterSpacing: -0.03 },
  medium: { fontSize: 26, lineHeight: 1.2, letterSpacing: -0.02 },
  small: { fontSize: 22, lineHeight: 1.22, letterSpacing: -0.01 },
}

const REGULAR_TITLE_TYPOGRAPHY: Record<TopicTitleTier, TopicTitleTypographyPreset> = {
  large: { fontSize: 16, lineHeight: 1.25, letterSpacing: 0 },
  medium: { fontSize: 15, lineHeight: 1.28, letterSpacing: 0 },
  small: { fontSize: 14, lineHeight: 1.32, letterSpacing: 0 },
}

const ROOT_TIER_THRESHOLDS = {
  large: 14,
  medium: 24,
}

const REGULAR_TIER_THRESHOLDS = {
  large: 18,
  medium: 30,
}

function isWhitespace(character: string): boolean {
  return /\s/u.test(character)
}

function isAsciiLetterOrDigit(character: string): boolean {
  return /^[A-Za-z0-9]$/u.test(character)
}

function isPunctuation(character: string): boolean {
  return /^[,./#!$%^&*;:{}=\-_`~()'"[\]<>?@\\|+，。！？；：、（）《》【】〈〉「」『』“”‘’…—·]$/u.test(
    character,
  )
}

function isFullWidthCharacter(codePoint: number): boolean {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd))
  )
}

function getCharacterWeight(character: string): number {
  if (isWhitespace(character) || isPunctuation(character)) {
    return 0.32
  }

  if (isAsciiLetterOrDigit(character)) {
    return 0.58
  }

  const codePoint = character.codePointAt(0)
  if (codePoint !== undefined && isFullWidthCharacter(codePoint)) {
    return 1
  }

  return 0.58
}

export function getWeightedTitleLength(title: string): number {
  const content = title.trim()
  if (!content) {
    return 0
  }

  return Number(
    [...content].reduce((total, character) => total + getCharacterWeight(character), 0).toFixed(2),
  )
}

function resolveTitleTier(weightedLength: number, kind: TopicTitleKind): TopicTitleTier {
  const thresholds = kind === 'root' ? ROOT_TIER_THRESHOLDS : REGULAR_TIER_THRESHOLDS

  if (weightedLength <= thresholds.large) {
    return 'large'
  }

  if (weightedLength <= thresholds.medium) {
    return 'medium'
  }

  return 'small'
}

export function getTopicTitleTypography(title: string, kind: TopicTitleKind): TopicTitleTypography {
  const weightedLength = getWeightedTitleLength(title)
  const tier = resolveTitleTier(weightedLength, kind)
  const preset = kind === 'root' ? ROOT_TITLE_TYPOGRAPHY[tier] : REGULAR_TITLE_TYPOGRAPHY[tier]

  return {
    kind,
    tier,
    weightedLength,
    ...preset,
  }
}

export function measureWeightedTitleWidth(
  title: string,
  fontSize: number,
  letterSpacing = 0,
): number {
  const content = [...title.trim()]
  if (content.length === 0) {
    return fontSize
  }

  const charactersWidth = content.reduce(
    (total, character) => total + getCharacterWeight(character) * fontSize,
    0,
  )
  const spacingWidth =
    content.length > 1 ? (content.length - 1) * fontSize * letterSpacing : 0

  return Math.max(fontSize, Math.ceil(charactersWidth + spacingWidth))
}

export function measureTopicTitle(
  title: string,
  options: { kind: TopicTitleKind; availableWidth: number },
): TopicTitleMeasurement {
  const typography = getTopicTitleTypography(title, options.kind)
  const estimatedWidth = measureWeightedTitleWidth(
    title,
    typography.fontSize,
    typography.letterSpacing,
  )
  const availableWidth = Math.max(1, Math.floor(options.availableWidth))
  const lineCount = Math.max(1, Math.ceil(estimatedWidth / availableWidth))
  const height = Math.ceil(lineCount * typography.fontSize * typography.lineHeight)

  return {
    ...typography,
    estimatedWidth,
    lineCount,
    height,
  }
}

export function getTopicTitleStyleVars(title: string, kind: TopicTitleKind): Record<string, string> {
  const typography = getTopicTitleTypography(title, kind)

  return {
    '--topic-title-font-size': `${typography.fontSize}px`,
    '--topic-title-line-height': `${typography.lineHeight}`,
    '--topic-title-letter-spacing': `${typography.letterSpacing}em`,
  }
}
