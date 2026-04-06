import { Button, IconButton, SegmentedControl } from '../../../components/ui'
import {
  TOPIC_MARKERS,
  TOPIC_STICKERS,
  type TopicMarker,
  type TopicNode,
  type TopicSticker,
} from '../../documents/types'
import { topicMarkerLabels, topicStickerGlyphs, topicStickerLabels } from '../../documents/topic-decorations'
import styles from './PropertiesPanel.module.css'

type MarkerSubtab = 'markers' | 'stickers'

interface MarkersPanelProps {
  selectedTopics: TopicNode[]
  activeSubtab: MarkerSubtab
  onSubtabChange: (value: MarkerSubtab) => void
  onToggleMarker: (marker: TopicMarker) => void
  onToggleSticker: (sticker: TopicSticker) => void
  onCollapse?: () => void
  id?: string
  className?: string
  mode?: 'docked' | 'drawer'
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export function MarkersPanel({
  selectedTopics,
  activeSubtab,
  onSubtabChange,
  onToggleMarker,
  onToggleSticker,
  onCollapse,
  id,
  className,
  mode = 'docked',
}: MarkersPanelProps) {
  const selectionCount = selectedTopics.length
  const hasSelection = selectionCount > 0

  return (
    <section id={id} className={classNames(styles.panel, className)} data-mode={mode}>
      {onCollapse ? (
        <div className={styles.collapseHeader}>
          <IconButton
            label="隐藏右侧栏"
            icon="chevronRight"
            tone="ghost"
            size="sm"
            className={styles.collapseButton}
            aria-controls={id}
            onClick={onCollapse}
          />
        </div>
      ) : null}

      <div className={styles.content}>
        <div className={styles.block}>
          <SegmentedControl
            value={activeSubtab}
            ariaLabel="标记面板子标签"
            onChange={(value) => onSubtabChange(value as MarkerSubtab)}
            options={[
              { value: 'markers', label: '标记' },
              { value: 'stickers', label: '贴纸' },
            ]}
          />
        </div>

        <div className={styles.block}>
          <span className={styles.label}>{activeSubtab === 'markers' ? '标记库' : '贴纸库'}</span>
          {!hasSelection ? (
            <p className={styles.helperText}>没有选中节点时，这里的按钮不会生效。</p>
          ) : null}
          <div className={styles.markerGrid}>
            {activeSubtab === 'markers'
              ? TOPIC_MARKERS.map((marker) => (
                  <Button
                    key={marker}
                    tone="primary"
                    size="sm"
                    className={styles.markerButton}
                    disabled={!hasSelection}
                    onClick={() => onToggleMarker(marker)}
                  >
                    {topicMarkerLabels[marker]}
                  </Button>
                ))
              : TOPIC_STICKERS.map((sticker) => (
                  <Button
                    key={sticker}
                    tone="primary"
                    size="sm"
                    className={styles.markerButton}
                    disabled={!hasSelection}
                    onClick={() => onToggleSticker(sticker)}
                  >
                    {topicStickerGlyphs[sticker]} {topicStickerLabels[sticker]}
                  </Button>
                ))}
          </div>
        </div>
      </div>
    </section>
  )
}
