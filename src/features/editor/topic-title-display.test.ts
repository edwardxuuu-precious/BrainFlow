import { describe, expect, it } from 'vitest'
import {
  getTopicTitleStyleVars,
  getTopicTitleTypography,
  getWeightedTitleLength,
  measureTopicTitle,
  measureWeightedTitleWidth,
} from './topic-title-display'

describe('topic-title-display', () => {
  it('weights mixed CJK and latin characters consistently', () => {
    expect(getWeightedTitleLength('异地 beachhead 7')).toBeCloseTo(8.44, 2)
    expect(getWeightedTitleLength('Go-to-market')).toBeCloseTo(6.44, 2)
  })

  it('resolves stable title tiers for regular and root titles', () => {
    expect(getTopicTitleTypography('修复方案', 'regular').tier).toBe('large')
    expect(getTopicTitleTypography('所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment', 'regular').tier).toBe(
      'small',
    )
    expect(getTopicTitleTypography('中心主题', 'root').tier).toBe('large')
    expect(getTopicTitleTypography('所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment', 'root').tier).toBe(
      'small',
    )
  })

  it('estimates wrapped title height from the shared typography rules', () => {
    const measurement = measureTopicTitle(
      '所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment',
      {
        kind: 'regular',
        availableWidth: 120,
      },
    )

    expect(measurement.lineCount).toBeGreaterThan(1)
    expect(measurement.height).toBeGreaterThan(measurement.fontSize * measurement.lineHeight)
    expect(measurement.estimatedWidth).toBe(
      measureWeightedTitleWidth(
        '所以第一步不是找“大市场”，而是锁定一个足够具体的 beachhead segment',
        measurement.fontSize,
        measurement.letterSpacing,
      ),
    )
  })

  it('returns inline CSS vars that match the resolved typography', () => {
    expect(getTopicTitleStyleVars('长期计划', 'regular')).toEqual({
      '--topic-title-font-size': '16px',
      '--topic-title-line-height': '1.25',
      '--topic-title-letter-spacing': '0em',
    })
  })
})
