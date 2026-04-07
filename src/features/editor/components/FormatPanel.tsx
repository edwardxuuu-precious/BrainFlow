import { Button, IconButton, SegmentedControl } from '../../../components/ui'
import { mindMapThemePresets } from '../../documents/theme'
import type { BranchSide, MindMapTheme, TopicNode, TopicStylePatch } from '../../documents/types'
import baseStyles from './PropertiesPanel.module.css'
import styles from './FormatPanel.module.css'

type FormatSubtab = 'topic' | 'canvas'

interface FormatPanelProps {
  topic: TopicNode | null
  selectionCount: number
  isFirstLevel: boolean
  activeSubtab: FormatSubtab
  theme: MindMapTheme
  onSubtabChange: (value: FormatSubtab) => void
  onStyleChange: (patch: TopicStylePatch) => void
  onApplyStyleToSelected: (patch: TopicStylePatch) => void
  onBranchSideChange: (side: BranchSide) => void
  onUpdateTheme: (patch: Partial<MindMapTheme>) => void
  onApplyThemePreset: (themeId: string) => void
  onCollapse?: () => void
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
}

const emphasisOptions = [
  { value: 'normal', label: '默认' },
  { value: 'focus', label: '强调' },
] as const

const variantOptions = [
  { value: 'default', label: '默认' },
  { value: 'soft', label: '柔和' },
  { value: 'solid', label: '实色' },
] as const

const sideOptions: BranchSide[] = ['auto', 'left', 'right']

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function colorValue(value: string | undefined, fallback: string): string {
  return /^#(?:[0-9a-fA-F]{6})$/.test(value ?? '') ? (value as string) : fallback
}

function renderStyleControls(
  applyPatch: (patch: TopicStylePatch) => void,
  fallbackTheme: Pick<MindMapTheme, 'surface' | 'text' | 'accent'>,
  style?: TopicNode['style'],
) {
  return (
    <div className={baseStyles.styleStack}>
      <div className={baseStyles.subsection}>
        <span className={baseStyles.sublabel}>强调态</span>
        <SegmentedControl
          value={style?.emphasis ?? 'normal'}
          ariaLabel="节点强调态"
          onChange={(value) => applyPatch({ emphasis: value as TopicStylePatch['emphasis'] })}
          options={emphasisOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </div>

      <div className={baseStyles.subsection}>
        <span className={baseStyles.sublabel}>节点预设</span>
        <SegmentedControl
          value={style?.variant ?? 'default'}
          ariaLabel="节点样式预设"
          onChange={(value) => applyPatch({ variant: value as TopicStylePatch['variant'] })}
          options={variantOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </div>

      <div className={baseStyles.colorGrid}>
        <label className={baseStyles.colorField}>
          <span className={baseStyles.sublabel}>背景色</span>
          <div className={baseStyles.colorControl}>
            <input
              type="color"
              className={baseStyles.colorInput}
              aria-label="节点背景色"
              value={colorValue(style?.background, fallbackTheme.surface)}
              onChange={(event) => applyPatch({ background: event.target.value })}
            />
            <Button
              tone="primary"
              size="sm"
              className={baseStyles.inlineButton}
              onClick={() => applyPatch({ background: null })}
            >
              清除
            </Button>
          </div>
        </label>

        <label className={baseStyles.colorField}>
          <span className={baseStyles.sublabel}>文字色</span>
          <div className={baseStyles.colorControl}>
            <input
              type="color"
              className={baseStyles.colorInput}
              aria-label="节点文字色"
              value={colorValue(style?.textColor, fallbackTheme.text)}
              onChange={(event) => applyPatch({ textColor: event.target.value })}
            />
            <Button
              tone="primary"
              size="sm"
              className={baseStyles.inlineButton}
              onClick={() => applyPatch({ textColor: null })}
            >
              清除
            </Button>
          </div>
        </label>

        <label className={baseStyles.colorField}>
          <span className={baseStyles.sublabel}>分支色</span>
          <div className={baseStyles.colorControl}>
            <input
              type="color"
              className={baseStyles.colorInput}
              aria-label="节点分支色"
              value={colorValue(style?.branchColor, fallbackTheme.accent)}
              onChange={(event) => applyPatch({ branchColor: event.target.value })}
            />
            <Button
              tone="primary"
              size="sm"
              className={baseStyles.inlineButton}
              onClick={() => applyPatch({ branchColor: null })}
            >
              清除
            </Button>
          </div>
        </label>
      </div>
    </div>
  )
}

export function FormatPanel({
  topic,
  selectionCount,
  isFirstLevel,
  activeSubtab,
  theme,
  onSubtabChange,
  onStyleChange,
  onApplyStyleToSelected,
  onBranchSideChange,
  onUpdateTheme,
  onApplyThemePreset,
  onCollapse,
  id,
  className,
  mode = 'docked',
}: FormatPanelProps) {
  const hasSelection = selectionCount > 0
  const isMultiSelection = selectionCount > 1

  return (
    <section id={id} className={classNames(baseStyles.panel, className)} data-mode={mode}>
      {onCollapse ? (
        <div className={baseStyles.collapseHeader}>
          <IconButton
            label="隐藏右侧栏"
            icon="chevronRight"
            tone="primary"
            size="sm"
            className={baseStyles.collapseButton}
            aria-controls={id}
            onClick={onCollapse}
          />
        </div>
      ) : null}

      <div className={baseStyles.content}>
        <div className={baseStyles.block}>
          <SegmentedControl
            value={activeSubtab}
            ariaLabel="格式面板子标签"
            onChange={(value) => onSubtabChange(value as FormatSubtab)}
            options={[
              { value: 'topic', label: '样式' },
              { value: 'canvas', label: '画布' },
            ]}
          />
        </div>

        {activeSubtab === 'topic' ? (
          hasSelection ? (
            <div className={baseStyles.content}>
              <div className={baseStyles.block}>
                <span className={baseStyles.label}>{isMultiSelection ? '批量样式' : '节点样式'}</span>
                {renderStyleControls(
                  isMultiSelection ? onApplyStyleToSelected : onStyleChange,
                  {
                    surface: theme.surface,
                    text: theme.text,
                    accent: theme.accent,
                  },
                  topic?.style,
                )}
              </div>

              {!isMultiSelection && topic ? (
                <div className={baseStyles.block}>
                  <span className={baseStyles.label}>结构</span>
                  <SegmentedControl
                    value={topic.branchSide}
                    ariaLabel="一级分支方向"
                    onChange={onBranchSideChange}
                    options={sideOptions.map((side) => ({
                      value: side,
                      label: side === 'auto' ? '自动' : side === 'left' ? '左侧' : '右侧',
                      disabled: !isFirstLevel,
                    }))}
                  />
                  {!isFirstLevel ? (
                    <p className={baseStyles.helperText}>只有一级分支可以切换左右方向。</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className={baseStyles.block}>
              <span className={baseStyles.label}>节点样式</span>
              <p className={baseStyles.helperText}>先选中节点，再在这里调整样式。</p>
            </div>
          )
        ) : (
          <>
            <div className={baseStyles.block}>
              <span className={baseStyles.label}>主题预设</span>
              <div className={styles.presetGrid}>
                {mindMapThemePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={styles.presetCard}
                    data-active={theme.id === preset.id}
                    onClick={() => onApplyThemePreset(preset.id)}
                  >
                    <div className={styles.presetPreview}>
                      {[preset.canvas, preset.surface, ...preset.branchPalette.slice(0, 2)].map((color) => (
                        <span
                          key={`${preset.id}-${color}`}
                          className={styles.presetSwatch}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                    <span className={styles.presetName}>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={baseStyles.block}>
              <span className={baseStyles.label}>画布颜色</span>
              <div className={baseStyles.colorGrid}>
                <label className={baseStyles.colorField}>
                  <span className={baseStyles.sublabel}>背景</span>
                  <input
                    type="color"
                    className={baseStyles.colorInput}
                    aria-label="画布背景色"
                    value={colorValue(theme.canvas, '#ffffff')}
                    onChange={(event) => onUpdateTheme({ canvas: event.target.value })}
                  />
                </label>
                <label className={baseStyles.colorField}>
                  <span className={baseStyles.sublabel}>面板</span>
                  <input
                    type="color"
                    className={baseStyles.colorInput}
                    aria-label="画布面板色"
                    value={colorValue(theme.surface, '#ffffff')}
                    onChange={(event) => onUpdateTheme({ surface: event.target.value })}
                  />
                </label>
                <label className={baseStyles.colorField}>
                  <span className={baseStyles.sublabel}>强调</span>
                  <input
                    type="color"
                    className={baseStyles.colorInput}
                    aria-label="画布强调色"
                    value={colorValue(theme.accent, '#000000')}
                    onChange={(event) => onUpdateTheme({ accent: event.target.value })}
                  />
                </label>
                <label className={baseStyles.colorField}>
                  <span className={baseStyles.sublabel}>正文</span>
                  <input
                    type="color"
                    className={baseStyles.colorInput}
                    aria-label="画布正文色"
                    value={colorValue(theme.text, '#000000')}
                    onChange={(event) => onUpdateTheme({ text: event.target.value })}
                  />
                </label>
                <label className={baseStyles.colorField}>
                  <span className={baseStyles.sublabel}>辅助文字</span>
                  <input
                    type="color"
                    className={baseStyles.colorInput}
                    aria-label="画布辅助文字色"
                    value={colorValue(theme.mutedText, '#000000')}
                    onChange={(event) => onUpdateTheme({ mutedText: event.target.value })}
                  />
                </label>
                <label className={baseStyles.colorField}>
                  <span className={baseStyles.sublabel}>背景网格</span>
                  <input
                    type="color"
                    className={baseStyles.colorInput}
                    aria-label="画布网格色"
                    value={colorValue(theme.panel, '#ffffff')}
                    onChange={(event) =>
                      onUpdateTheme({
                        panel: event.target.value,
                        grid: `${event.target.value}22`,
                      })
                    }
                  />
                </label>
              </div>
            </div>

            <div className={baseStyles.block}>
              <span className={baseStyles.label}>分支色板</span>
              <div className={baseStyles.colorGrid}>
                {theme.branchPalette.map((color, index) => (
                  <label key={`branch-${index}`} className={baseStyles.colorField}>
                    <span className={baseStyles.sublabel}>分支 {index + 1}</span>
                    <input
                      type="color"
                      className={baseStyles.colorInput}
                      aria-label={`分支色 ${index + 1}`}
                      value={colorValue(color, theme.accent)}
                      onChange={(event) => {
                        const nextBranchPalette = [...theme.branchPalette]
                        nextBranchPalette[index] = event.target.value
                        onUpdateTheme({ branchPalette: nextBranchPalette })
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
