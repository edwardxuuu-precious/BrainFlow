import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type {
  TextImportArchetype,
  TextImportCrossFileMergeSuggestion,
  TextImportPreset,
  TextImportProgressEntry,
  TextImportPreviewNode,
  TextImportPreprocessHint,
  TextImportResponse,
  TextImportSourceType,
  TextImportTraceEntry,
} from '../../../../shared/ai-contract'
import {
  formatTextImportClassificationConfidence,
  type TextImportSourcePlanningSummary,
} from '../../../../shared/text-import-semantics'
import { Button, IconButton, Input, SurfacePanel } from '../../../components/ui'
import type { SemanticMergeStage } from '../local-text-import-core'
import {
  buildTextImportActivityBlocks,
  formatTextImportActivityLead,
} from '../text-import-activity'
import type { TextImportJobMode, TextImportJobType } from '../text-import-job'
import type { TextImportAnchorMode, TextImportErrorState } from '../text-import-store'
import {
  ARCHETYPE_OPTIONS,
  buildTraceFeedItems,
  countPreviewNodes,
  createErrorDiagnostics,
  describePipeline,
  describeSemanticStage,
  formatActivityKindLabel,
  formatDocumentTypeLabel,
  formatElapsed,
  formatMergeConfidence,
  formatPlanningConfidence,
  formatSemanticRole,
  formatSourceSpans,
  formatTraceAttempt,
  formatTraceChannel,
  formatTraceLead,
  formatTraceOffset,
  resolveSkillPhase,
  REVIEW_TABS,
  SKILL_PHASES,
  stringifyTracePayload,
  summarizeTracePayload,
  type ReviewTab,
} from './text-import-dialog-utils'
import styles from './TextImportDialog.module.css'

interface TextImportSourceFileState {
  sourceName: string
  sourceType: TextImportSourceType
  textLength: number
}

interface TextImportDialogProps {
  open: boolean
  sourceName: string | null
  sourceType: TextImportSourceType | null
  sourceFiles: TextImportSourceFileState[]
  rawText: string
  draftSourceName: string
  draftText: string
  preprocessedHints: TextImportPreprocessHint[]
  preview: TextImportResponse | null
  draftTree: TextImportPreviewNode[]
  previewTree: TextImportPreviewNode[]
  draftConfirmed: boolean
  planningSummaries: TextImportSourcePlanningSummary[]
  crossFileMergeSuggestions: TextImportCrossFileMergeSuggestion[]
  approvedConflictIds: string[]
  statusText: string
  progress: number
  progressIndeterminate: boolean
  progressEntries: TextImportProgressEntry[]
  traceEntries: TextImportTraceEntry[]
  modeHint: string | null
  error: TextImportErrorState | null
  isPreviewing: boolean
  isApplying: boolean
  previewStartedAt: number | null
  previewFinishedAt: number | null
  jobMode: TextImportJobMode | null
  jobType: TextImportJobType | null
  fileCount: number
  completedFileCount: number
  currentFileName: string | null
  semanticMergeStage: SemanticMergeStage
  semanticCandidateCount: number
  semanticAdjudicatedCount: number
  semanticFallbackCount: number
  applyProgress: number
  appliedCount: number
  totalOperations: number
  currentApplyLabel: string | null
  presetOverride: TextImportPreset | null
  archetypeOverride?: TextImportArchetype | null
  anchorMode: TextImportAnchorMode
  documentRootLabel: string
  currentSelectionLabel: string | null
  repairLabel?: string
  repairDescription?: string | null
  repairDisabled?: boolean
  onClose: () => void
  onChooseFiles: (files: File[]) => void | Promise<void>
  onPresetChange: (value: TextImportPreset | null) => void
  onArchetypeChange?: (value: TextImportArchetype | null) => void
  onAnchorModeChange: (value: TextImportAnchorMode) => void
  onDraftSourceNameChange: (value: string) => void
  onDraftTextChange: (value: string) => void
  onGenerateFromText: () => void
  onToggleConflict: (conflictId: string) => void
  onConfirmDraft: () => void
  onRenamePreviewNode: (nodeId: string, title: string) => void
  onPromotePreviewNode: (nodeId: string) => void
  onDemotePreviewNode: (nodeId: string) => void
  onDeletePreviewNode: (nodeId: string) => void
  onApply: () => void
  onRepair?: () => void
}

interface EditablePreviewTreeProps {
  nodes: TextImportPreviewNode[]
  disabled?: boolean
  onRenameNode: (nodeId: string, title: string) => void
  onPromoteNode: (nodeId: string) => void
  onDemoteNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}

function EditablePreviewTreeNode({
  node,
  disabled = false,
  onRenameNode,
  onPromoteNode,
  onDemoteNode,
  onDeleteNode,
}: {
  node: TextImportPreviewNode
  disabled?: boolean
  onRenameNode: (nodeId: string, title: string) => void
  onPromoteNode: (nodeId: string) => void
  onDemoteNode: (nodeId: string) => void
  onDeleteNode: (nodeId: string) => void
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(node.title)

  useEffect(() => {
    setDraftTitle(node.title)
  }, [node.title])

  const commitRename = () => {
    const nextTitle = draftTitle.trim()
    if (!nextTitle) {
      setDraftTitle(node.title)
      setIsEditingTitle(false)
      return
    }

    if (nextTitle !== node.title) {
      onRenameNode(node.id, nextTitle)
    }
    setIsEditingTitle(false)
  }

  return (
    <li className={styles.treeItem}>
      <div className={styles.treeCard} data-relation={node.relation}>
        <div className={styles.treeTitleRow}>
          {isEditingTitle ? (
            <div className={styles.treeTitleEditor}>
              <Input
                value={draftTitle}
                disabled={disabled}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitRename()
                  }
                  if (event.key === 'Escape') {
                    setDraftTitle(node.title)
                    setIsEditingTitle(false)
                  }
                }}
                onBlur={commitRename}
              />
            </div>
          ) : (
            <strong>{node.title}</strong>
          )}
          <div className={styles.treeBadgeRow}>
            {formatSemanticRole(node.semanticRole) ? (
              <span className={styles.treeSemanticBadge}>{formatSemanticRole(node.semanticRole)}</span>
            ) : null}
            {node.confidence ? (
              <span className={styles.treeConfidenceBadge}>{node.confidence}</span>
            ) : null}
            {formatSourceSpans(node.sourceAnchors) ? (
              <span className={styles.treeBadge}>{formatSourceSpans(node.sourceAnchors)}</span>
            ) : null}
            <span className={styles.treeBadge}>
              {node.relation === 'new'
                ? 'New branch'
                : node.relation === 'merge'
                  ? 'Semantic merge'
                  : 'Conflict'}
            </span>
          </div>
        </div>
        {node.reason ? <p className={styles.treeReason}>{node.reason}</p> : null}
        {node.note ? <p className={styles.treeNote}>{node.note}</p> : null}
        <div className={styles.treeActionRow}>
          <Button
            tone="ghost"
            size="xs"
            iconStart="edit"
            disabled={disabled}
            onClick={() => {
              setDraftTitle(node.title)
              setIsEditingTitle(true)
            }}
          >
            Rename
          </Button>
          <Button
            tone="ghost"
            size="xs"
            disabled={disabled || node.parentId === null}
            onClick={() => onPromoteNode(node.id)}
          >
            Promote
          </Button>
          <Button
            tone="ghost"
            size="xs"
            disabled={disabled || node.parentId === null || node.order === 0}
            onClick={() => onDemoteNode(node.id)}
          >
            Nest under previous
          </Button>
          <Button
            tone="danger"
            size="xs"
            iconStart="delete"
            disabled={disabled}
            onClick={() => onDeleteNode(node.id)}
          >
            Delete
          </Button>
        </div>
      </div>
      {node.children.length > 0 ? (
        <EditablePreviewTree
          nodes={node.children}
          disabled={disabled}
          onRenameNode={onRenameNode}
          onPromoteNode={onPromoteNode}
          onDemoteNode={onDemoteNode}
          onDeleteNode={onDeleteNode}
        />
      ) : null}
    </li>
  )
}

function EditablePreviewTree({
  nodes,
  disabled = false,
  onRenameNode,
  onPromoteNode,
  onDemoteNode,
  onDeleteNode,
}: EditablePreviewTreeProps) {
  if (nodes.length === 0) {
    return <p className={styles.empty}>No structured preview is available yet.</p>
  }

  return (
    <ul className={styles.treeList}>
      {nodes.map((node) => (
        <EditablePreviewTreeNode
          key={node.id}
          node={node}
          disabled={disabled}
          onRenameNode={onRenameNode}
          onPromoteNode={onPromoteNode}
          onDemoteNode={onDemoteNode}
          onDeleteNode={onDeleteNode}
        />
      ))}
    </ul>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className={styles.emptyState}>
      <strong className={styles.emptyStateTitle}>{title}</strong>
      <p className={styles.emptyStateDescription}>{description}</p>
    </div>
  )
}

export function TextImportDialog({
  open,
  sourceFiles,
  preview,
  draftTree,
  draftConfirmed,
  planningSummaries,
  crossFileMergeSuggestions,
  approvedConflictIds,
  statusText,
  progress,
  progressIndeterminate,
  progressEntries = [],
  traceEntries = [],
  modeHint,
  error,
  isPreviewing,
  isApplying,
  previewStartedAt,
  previewFinishedAt,
  jobMode,
  jobType,
  fileCount,
  completedFileCount,
  currentFileName,
  semanticMergeStage,
  semanticCandidateCount,
  semanticAdjudicatedCount,
  semanticFallbackCount,
  applyProgress,
  appliedCount,
  totalOperations,
  currentApplyLabel,
  archetypeOverride = null,
  anchorMode,
  documentRootLabel,
  currentSelectionLabel,
  repairLabel = 'Repair current import',
  repairDescription = null,
  repairDisabled = false,
  onClose,
  onChooseFiles,
  onArchetypeChange = () => {},
  onAnchorModeChange,
  onToggleConflict,
  onConfirmDraft,
  onRenamePreviewNode,
  onPromotePreviewNode,
  onDemotePreviewNode,
  onDeletePreviewNode,
  onApply,
  onRepair,
}: TextImportDialogProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [showFileDetails, setShowFileDetails] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showInternals, setShowInternals] = useState(false)
  const [showActivityTimeline, setShowActivityTimeline] = useState(false)
  const [reviewTab, setReviewTab] = useState<ReviewTab>(() => (isApplying ? 'merge' : 'draft'))
  const previousPreviewingRef = useRef(isPreviewing)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const showAdvancedSettings = false

  const handleChooseFilesClick = () => {
    const input = fileInputRef.current
    if (!input) {
      return
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }

    input.click()
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (files.length === 0) {
      return
    }

    void onChooseFiles(files)
  }

  const handleInternalsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextChecked = event.target.checked
    setShowInternals(nextChecked)

    if (nextChecked) {
      setShowDetails(true)
    }
  }

  useEffect(() => {
    if (!open || !isPreviewing || previewStartedAt === null) {
      return
    }
    setNowMs(Date.now())
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(intervalId)
  }, [open, isPreviewing, previewStartedAt])

  useEffect(() => {
    if (!open) {
      setReviewTab('draft')
      setShowFileDetails(false)
      setShowDetails(false)
      setShowInternals(false)
      setShowActivityTimeline(false)
      previousPreviewingRef.current = isPreviewing
    }
  }, [open, isPreviewing])

  useEffect(() => {
    if (!open) {
      previousPreviewingRef.current = isPreviewing
      return
    }

    if (!isPreviewing && previousPreviewingRef.current && preview) {
      setReviewTab('draft')
    }

    previousPreviewingRef.current = isPreviewing
  }, [open, isPreviewing, preview])

  useEffect(() => {
    if (open && isApplying) {
      setReviewTab('merge')
    }
  }, [open, isApplying])

  const elapsedMs =
    previewStartedAt === null
      ? 0
      : (isPreviewing ? nowMs : (previewFinishedAt ?? nowMs)) - previewStartedAt
  const displayProgress = isApplying ? applyProgress : progress
  const previewReady = Boolean(preview)
  const mergeReviewReady = Boolean(preview && draftConfirmed)
  const statusSummary = isApplying
    ? `Progress ${displayProgress}%`
    : progressIndeterminate
      ? `Working | Elapsed ${formatElapsed(elapsedMs)}`
      : `Progress ${displayProgress}% | Elapsed ${formatElapsed(elapsedMs)}`
  const activityBlocks = useMemo(
    () =>
      buildTextImportActivityBlocks({
        jobMode,
        jobType,
        traceEntries,
        progressEntries,
        statusText,
      }),
    [jobMode, jobType, progressEntries, statusText, traceEntries],
  )
  const traceFeedItems = useMemo(() => buildTraceFeedItems(traceEntries), [traceEntries])
  const showActivitySection = Boolean(activityBlocks.length > 0 || (isPreviewing && !isApplying))
  const activityHeadline =
    jobMode === 'local_markdown'
      ? `本地导入过程 | ${formatElapsed(elapsedMs)}`
      : `运行过程流 | ${formatElapsed(elapsedMs)}`
  const activityLead =
    jobMode === 'local_markdown'
      ? '显示本地解析与构建步骤。'
      : '基于真实 Codex 事件派生的运行过程。'
  const latestActivityId = activityBlocks.at(-1)?.id ?? null
  const showRawTraceSection = showInternals && traceEntries.length > 0
  const rawTraceHeadline =
    jobMode === 'local_markdown'
      ? `原始事件流 | ${formatElapsed(elapsedMs)}`
      : `原始事件流 | ${formatElapsed(elapsedMs)}`
  const rawTraceLead =
    jobMode === 'local_markdown'
      ? '显示本地 request / parse 事件。'
      : '显示 request、runner 与 Codex 的原始事件。'
  const latestTraceFeedItem = traceFeedItems.at(-1)
  const latestTraceEntryId = latestTraceFeedItem
    ? latestTraceFeedItem.kind === 'delta'
      ? latestTraceFeedItem.id
      : latestTraceFeedItem.entry.id
    : null
  const errorDisplay = error ? createErrorDiagnostics(error, currentFileName) : null
  const sourceError = error?.stage === 'applying_changes' ? null : errorDisplay
  const applyError = error?.stage === 'applying_changes' ? errorDisplay : null
  const hasStructuredPreview = draftTree.length > 0
  const hasMergeReviewContent = Boolean(
    preview?.mergeSuggestions?.length ||
      crossFileMergeSuggestions.length ||
      preview?.conflicts.length ||
      preview?.warnings?.length,
  )
  const showStructuredGeneratingState = isPreviewing && !hasStructuredPreview
  const showStructuredEmptyState = !isPreviewing && !hasStructuredPreview
  const showMergeGeneratingState = isPreviewing && !mergeReviewReady
  const showMergeBlockedState = !isPreviewing && previewReady && !mergeReviewReady
  const showMergeNoReviewNeededState = mergeReviewReady && !hasMergeReviewContent
  const classification = preview?.classification ?? null
  const classificationConfidence = classification
    ? formatTextImportClassificationConfidence(classification.confidence)
    : null
  const effectivePlanningSummaries = planningSummaries
  const hasLowConfidencePlanning = effectivePlanningSummaries.some(
    (summary) => !summary.isManual && summary.confidence === 'low',
  )
  const isBatchPlanning = effectivePlanningSummaries.length > 1
  const primaryPlanningSummary = effectivePlanningSummaries[0] ?? null
  const diagnostics = preview?.diagnostics ?? null
  const selectedArchetypeOption =
    ARCHETYPE_OPTIONS.find((option) => option.id === archetypeOverride) ?? ARCHETYPE_OPTIONS[0]
  const detectedDocumentType = classification
    ? formatDocumentTypeLabel(classification.archetype)
    : isBatchPlanning
      ? 'Per file'
      : primaryPlanningSummary
        ? formatDocumentTypeLabel(primaryPlanningSummary.resolvedArchetype)
        : 'Auto detect'
  const detectedConfidence = classification
    ? `${classificationConfidence ?? 'low'} (${Math.round(classification.confidence * 100)}%)`
    : isBatchPlanning
      ? (hasLowConfidencePlanning ? 'Mixed confidence' : 'Stable')
      : primaryPlanningSummary
        ? primaryPlanningSummary.isManual
          ? 'Manual override'
          : formatPlanningConfidence(primaryPlanningSummary.confidence)
        : 'Pending'
  const detectionRationale = classification?.rationale ??
    (isBatchPlanning
      ? 'Each file is classified independently before the batch preview is composed.'
      : primaryPlanningSummary?.rationale ??
        'The skill will detect the source type and build the map in source order when the preview starts.')
  const activePhaseId = resolveSkillPhase({
    isApplying,
    isPreviewing,
    previewReady,
    draftConfirmed,
    semanticMergeStage,
    progress,
  })
  const activePhaseLabel = SKILL_PHASES.find((phase) => phase.id === activePhaseId)?.label ?? 'Detect type'
  const hasSourceInput = sourceFiles.length > 0
  const primaryStatusMessage = isApplying
    ? statusText || 'Applying the approved import changes to the canvas.'
    : statusText
      ? statusText
      : mergeReviewReady
        ? 'Merge review is ready. Resolve conflicts and overlaps before applying the changes.'
        : previewReady
          ? 'The logic map is ready. Review the draft and confirm it before enabling merge review.'
          : hasSourceInput
            ? 'Ready to run the skill-backed import.'
            : 'Choose files to start the skill-backed import.'
  const sourceSummaryLabel =
    sourceFiles.length > 1
      ? `Imported ${sourceFiles.length} files`
      : sourceFiles.length === 1
        ? sourceFiles[0]?.sourceName ?? 'Unknown file'
        : 'No file imported'
  const showStatusProgress = Boolean(isPreviewing || statusText || previewReady || isApplying)
  const draftNodeCount = countPreviewNodes(draftTree)
  const pendingDecisionCount =
    (preview?.conflicts.length ?? 0) +
    (preview?.mergeSuggestions?.length ?? 0) +
    crossFileMergeSuggestions.length
  const pendingWarningCount = preview?.warnings?.length ?? 0
  const canConfirmDraft = Boolean(previewReady && hasStructuredPreview && !draftConfirmed && !isPreviewing && !isApplying)
  const canOpenMergeTab = Boolean(draftConfirmed || isApplying)
  const canShowDetails = false
  const showStatusSection = Boolean(hasSourceInput || isPreviewing || isApplying || previewReady || sourceError)
  const showReviewSection = Boolean(previewReady || isApplying)
  const statusTypeSummary = archetypeOverride
    ? `Pinned type · ${formatDocumentTypeLabel(archetypeOverride)}`
    : `${detectedDocumentType} · ${detectedConfidence}`
  const handleConfirmDraft = () => {
    onConfirmDraft()
    setReviewTab('merge')
  }

  if (!open) {
    return null
  }

  return (
    <div className={styles.overlay} role="presentation">
      <SurfacePanel
        role="dialog"
        aria-modal="true"
        aria-labelledby="text-import-title"
        className={styles.dialog}
      >
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Smart Import</p>
            <h2 id="text-import-title" className={styles.title}>
              Import with skill
            </h2>
            <p className={styles.headerLead}>
              Import files into a logic map, then review only the decisions that matter.
            </p>
          </div>
          <div className={styles.headerActions}>
            <IconButton label="Close import draft" icon="close" tone="primary" size="sm" onClick={onClose} />
          </div>
        </div>

        <div className={styles.pageViewport}>
          <section className={styles.inputPanel} aria-label="Prepare import">
            <div className={styles.sourcePrimaryRow}>
              <div className={styles.prepareHeaderActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  multiple
                  onChange={handleFileInputChange}
                />
                <Button
                  tone="primary"
                  onClick={handleChooseFilesClick}
                  disabled={isPreviewing || isApplying}
                  size="sm"
                >
                  Import files
                </Button>
              </div>
            </div>

            <div className={styles.sourceSummaryStrip}>
              <div className={styles.sourceSummaryCopy}>
                <strong
                  className={styles.sourceSummaryTitle}
                  title={sourceFiles.length === 1 ? sourceFiles[0]?.sourceName : undefined}
                >
                  {sourceSummaryLabel}
                </strong>
              </div>
              {sourceFiles.length > 1 ? (
                <button
                  type="button"
                  className={styles.inlineLinkButton}
                  onClick={() => setShowFileDetails((value) => !value)}
                  aria-expanded={showFileDetails}
                  aria-label={showFileDetails ? 'Hide file details' : 'Show file details'}
                >
                  {showFileDetails ? 'Hide files' : 'View files'}
                </button>
              ) : null}
            </div>
            {showFileDetails && sourceFiles.length > 1 ? (
              <div className={styles.fileListInline}>
                {sourceFiles.map((file) => {
                  const planningSummary = effectivePlanningSummaries.find(
                    (summary) => summary.sourceName === file.sourceName,
                  )

                  return (
                    <div key={file.sourceName} className={styles.fileListItem}>
                      <div className={styles.fileListCopy}>
                        <span className={styles.fileName}>{file.sourceName}</span>
                        {planningSummary ? (
                          <span className={styles.filePlanningMeta}>
                            {formatDocumentTypeLabel(planningSummary.resolvedArchetype)}
                            {' | '}
                            {planningSummary.isManual
                              ? 'Manual override'
                              : formatPlanningConfidence(planningSummary.confidence)}
                          </span>
                        ) : null}
                      </div>
                      <span className={styles.fileLength}>{file.textLength} chars</span>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {showAdvancedSettings ? (
              <div className={styles.advancedInline}>
                <div className={styles.toolbarRow}>
                  <label className={styles.toolbarField} aria-label="Import target">
                    <span className={styles.metaLabel}>Import target</span>
                    <select
                      className={styles.select}
                      value={anchorMode}
                      onChange={(event) => onAnchorModeChange(event.target.value as TextImportAnchorMode)}
                      disabled={isPreviewing || isApplying}
                    >
                      <option value="document_root">Document root: {documentRootLabel}</option>
                      <option value="current_selection">
                        Current selection: {currentSelectionLabel ?? 'No active topic'}
                      </option>
                    </select>
                    <span className={styles.selectDescription}>
                      {anchorMode === 'document_root'
                        ? 'Default. Each import starts at the document root so repeated imports stay as sibling branches.'
                        : 'Import under the current topic when you intentionally want to nest the next branch.'}
                    </span>
                  </label>

                  <label className={styles.toolbarField}>
                    <span className={styles.metaLabel}>Document type</span>
                    <select
                      className={styles.select}
                      value={archetypeOverride ?? 'auto'}
                      onChange={(event) =>
                        onArchetypeChange(
                          event.target.value === 'auto'
                            ? null
                            : (event.target.value as TextImportArchetype),
                        )
                      }
                      disabled={isPreviewing || isApplying}
                    >
                      {ARCHETYPE_OPTIONS.map((option) => (
                        <option key={option.id ?? 'auto'} value={option.id ?? 'auto'}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {anchorMode === 'current_selection' ? (
                  <p className={styles.anchorWarning}>
                    The next import will be nested under the currently selected topic instead of the document root.
                  </p>
                ) : null}
                <p className={styles.prepareMeta}>{selectedArchetypeOption.description}</p>
                <label className={styles.checkboxField}>
                  <span className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={showInternals}
                      onChange={handleInternalsChange}
                    />
                    <span>Show import internals</span>
                  </span>
                </label>
              </div>
            ) : null}
          </section>

          {showStatusSection ? (
            <section className={styles.statusStrip} aria-label="Skill status">
              <div className={styles.statusMetaRow}>
                <div className={styles.treeBadgeRow}>
                  <span className={styles.inlineBadge}>{activePhaseLabel}</span>
                  <span className={styles.statusInlineMeta}>{statusTypeSummary}</span>
                </div>
              </div>

              <p className={styles.statusLead}>{primaryStatusMessage}</p>

              {showStatusProgress ? (
                <>
                  <div
                    className={`${styles.progressTrack} ${progressIndeterminate ? styles.progressTrackIndeterminate : ''}`}
                    aria-hidden="true"
                  >
                    <div
                      className={`${styles.progressFill} ${progressIndeterminate ? styles.progressFillIndeterminate : ''}`}
                      style={progressIndeterminate ? undefined : { width: `${displayProgress}%` }}
                    />
                  </div>
                  <div className={styles.statusRow}>
                    <p className={styles.statusMeta}>{statusSummary}</p>
                    {jobType === 'batch' ? (
                      <p className={styles.statusMeta}>
                        Files {completedFileCount}/{fileCount}
                        {currentFileName ? ` | Current: ${currentFileName}` : ''}
                      </p>
                    ) : null}
                  </div>
                  {(semanticMergeStage !== 'idle' ||
                    semanticCandidateCount > 0 ||
                    semanticAdjudicatedCount > 0 ||
                    semanticFallbackCount > 0) ? (
                    <p className={styles.statusMeta}>
                      Semantic stage: {describeSemanticStage(semanticMergeStage)}
                      {(semanticCandidateCount > 0 || semanticAdjudicatedCount > 0)
                        ? ` | Candidates ${semanticCandidateCount}/${semanticAdjudicatedCount}${semanticFallbackCount > 0 ? ` | Fallbacks ${semanticFallbackCount}` : ''}`
                        : ''}
                    </p>
                  ) : null}
                </>
              ) : null}

              {showActivitySection ? (
                <details
                  className={styles.detailsPanel}
                  open={showActivityTimeline}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open
                    if (nextOpen !== showActivityTimeline) {
                      setShowActivityTimeline(nextOpen)
                    }
                  }}
                >
                  <summary className={styles.detailsSummary}>运行过程流</summary>
                  {showActivityTimeline ? (
                    <div className={styles.codexFeedSection}>
                      <div className={styles.codexFeedHeader}>
                        <div>
                          <p className={styles.codexFeedTitle}>{activityHeadline}</p>
                          <p className={styles.codexFeedLead}>{activityLead}</p>
                        </div>
                        <div className={styles.codexFeedMetaBlock}>
                          <span className={styles.codexFeedPill}>
                            {activityBlocks.length > 0 ? `${activityBlocks.length} 条` : '等待事件'}
                          </span>
                        </div>
                      </div>
                      {activityBlocks.length > 0 ? (
                        <ol className={styles.codexFeedList}>
                          {activityBlocks.map((block) => (
                            <li
                              key={block.id}
                              className={styles.codexFeedItem}
                              data-active={block.id === latestActivityId}
                              data-kind={block.kind}
                            >
                              <div className={styles.codexFeedItemHeader}>
                                <div className={styles.treeBadgeRow}>
                                  <span className={styles.codexFeedType}>
                                    {formatActivityKindLabel(block.kind)}
                                  </span>
                                </div>
                                <span className={styles.timelineDuration}>
                                  {formatTraceOffset(block.timestampMs, previewStartedAt)}
                                </span>
                              </div>
                              <p className={styles.codexFeedSummary}>
                                {formatTextImportActivityLead(
                                  block.currentFileName,
                                  block.kind === 'tool_group' ? block.summary : block.message,
                                  jobType === 'batch',
                                )}
                              </p>
                              {block.kind === 'tool_group' ? (
                                <ul className={styles.activityToolList}>
                                  {block.lines.map((line, index) => (
                                    <li key={`${block.id}_${index}`} className={styles.activityToolItem}>
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p
                          className={styles.codexFeedEmpty}
                          data-empty-copy={
                            jobMode === 'local_markdown'
                              ? '本地解析步骤会显示在这里。'
                              : '真实 Codex 过程事件到达后会显示在这里。'
                          }
                        />
                      )}
                    </div>
                  ) : null}
                </details>
              ) : null}

              {showRawTraceSection ? (
                <details className={styles.detailsPanel}>
                  <summary className={styles.detailsSummary}>原始事件流</summary>
                  <div className={styles.codexFeedSection}>
                    <div className={styles.codexFeedHeader}>
                      <div>
                        <p className={styles.codexFeedTitle}>{rawTraceHeadline}</p>
                        <p className={styles.codexFeedLead}>{rawTraceLead}</p>
                      </div>
                      <div className={styles.codexFeedMetaBlock}>
                        <span className={styles.codexFeedPill}>
                          {traceEntries.length > 0 ? `${traceEntries.length} 条事件` : '等待事件'}
                        </span>
                      </div>
                    </div>
                    {traceFeedItems.length > 0 ? (
                      <ol className={styles.codexFeedList}>
                        {traceFeedItems.map((item) => (
                          <li
                            key={item.kind === 'delta' ? item.id : item.entry.id}
                            className={styles.codexFeedItem}
                            data-active={
                              (item.kind === 'delta' ? item.id : item.entry.id) === latestTraceEntryId
                            }
                          >
                            <div className={styles.codexFeedItemHeader}>
                              <div className={styles.treeBadgeRow}>
                                <span className={styles.codexFeedType}>
                                  {formatTraceAttempt(item.kind === 'delta' ? item.attempt : item.entry.attempt)}
                                </span>
                                <span className={styles.codexFeedType}>
                                  {formatTraceChannel(item.kind === 'delta' ? item.channel : item.entry.channel)}
                                </span>
                                <span className={styles.codexFeedType}>
                                  {item.kind === 'delta' ? item.eventType : item.entry.eventType}
                                </span>
                              </div>
                              <span className={styles.timelineDuration}>
                                {formatTraceOffset(
                                  item.kind === 'delta' ? item.timestampMs : item.entry.timestampMs,
                                  previewStartedAt,
                                )}
                              </span>
                            </div>
                            <p className={styles.codexFeedSummary}>
                              {item.kind === 'delta'
                                ? formatTraceLead(item.currentFileName, item.text)
                                : formatTraceLead(
                                    item.entry.currentFileName,
                                    summarizeTracePayload(item.entry.payload),
                                  )}
                            </p>
                            {item.kind === 'event' ? (
                              <details className={styles.codexFeedRaw}>
                                <summary>View raw JSON</summary>
                                <pre>{stringifyTracePayload(item.entry.payload)}</pre>
                              </details>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className={styles.codexFeedEmpty} data-empty-copy="原始事件到达后会显示在这里。" />
                    )}
                  </div>
                </details>
              ) : null}

              {sourceError ? (
                <div className={styles.errorPanel}>
                  <p className={styles.error}>{sourceError.summary}</p>
                  {sourceError.meta ? <p className={styles.errorMeta}>{sourceError.meta}</p> : null}
                  {sourceError.detail ? <p className={styles.errorMeta}>Raw error: {sourceError.detail}</p> : null}
                </div>
              ) : null}

              {canShowDetails ? (
                <details
                  className={styles.detailsPanel}
                  open={showDetails}
                  onToggle={(event) => {
                    const nextOpen = event.currentTarget.open
                    if (nextOpen !== showDetails) {
                      setShowDetails(nextOpen)
                    }
                  }}
                >
                  <summary className={styles.detailsSummary}>Why and details</summary>
                  {showDetails ? (
                    <div className={styles.detailsBody}>
                      <p className={styles.detailsText}>
                        <strong>Type rationale.</strong> {detectionRationale}
                      </p>
                      {preview?.summary ? (
                        <p className={styles.detailsText}>
                          <strong>Preview summary.</strong> {preview.summary}
                        </p>
                      ) : null}
                      <p className={styles.detailsText}>
                        <strong>Pipeline.</strong> {modeHint ?? describePipeline(jobMode)}
                      </p>

                      {showInternals && diagnostics ? (
                        <>
                          <p className={styles.detailsText}>
                            <strong>Timings.</strong> Preprocess {diagnostics.timings.preprocessMs} ms, planning {diagnostics.timings.planningMs} ms, parse {diagnostics.timings.parseTreeMs} ms, total {diagnostics.timings.totalMs} ms.
                          </p>
                          <p className={styles.detailsText}>
                            <strong>Density.</strong> {diagnostics.densityStats.previewNodeCount} preview nodes, {diagnostics.densityStats.operationCount} operations, max depth {diagnostics.densityStats.maxDepth}.
                          </p>
                          <p className={styles.detailsText}>
                            <strong>Quality.</strong> {diagnostics.qualitySignals.warningCount} warnings, {diagnostics.qualitySignals.lowConfidenceNodeCount} low-confidence nodes.
                          </p>
                        </>
                      ) : null}

                      {showInternals && onRepair ? (
                        <div>
                          {repairDescription ? <p className={styles.detailsText}>{repairDescription}</p> : null}
                          <Button
                            tone="ghost"
                            size="sm"
                            onClick={onRepair}
                            disabled={repairDisabled || isPreviewing || isApplying}
                          >
                            {repairLabel}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </details>
              ) : null}
            </section>
          ) : null}

          {showReviewSection ? (
            <section className={`${styles.section} ${styles.reviewShell}`} aria-label="Review">
              <div className={styles.reviewTopBar}>
                <div className={styles.headerCopy}>
                  <h3 className={styles.sectionTitle}>{reviewTab === 'draft' ? 'Draft' : 'Merge review'}</h3>
                  <p className={styles.sectionIntro}>
                    {reviewTab === 'draft'
                      ? 'Tighten the generated logic map before you unlock merge decisions.'
                      : 'Only conflicts, overlaps, and warnings stay here.'}
                  </p>
                </div>

                <div className={styles.reviewTabs} role="tablist" aria-label="Review tabs">
                  {REVIEW_TABS.map((tab) => {
                    const disabled = tab.id === 'merge' && !canOpenMergeTab

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`text-import-tab-${tab.id}`}
                        className={styles.reviewTab}
                        data-active={reviewTab === tab.id}
                        aria-selected={reviewTab === tab.id}
                        aria-controls={`text-import-panel-${tab.id}`}
                        disabled={disabled}
                        onClick={() => {
                          if (!disabled) {
                            setReviewTab(tab.id)
                          }
                        }}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {reviewTab === 'draft' ? (
                <div
                  role="tabpanel"
                  id="text-import-panel-draft"
                  aria-labelledby="text-import-tab-draft"
                  className={styles.reviewPanel}
                >
                  <p className={styles.reviewSummaryText}>
                    {preview?.summary ?? 'Review the generated logic map before you unlock merge decisions.'}
                  </p>

                  {showStructuredGeneratingState ? (
                    <EmptyState
                      title="Building logic map"
                      description="The skill is still turning the source into an ordered map. The draft will appear here as soon as the preview is ready."
                    />
                  ) : showStructuredEmptyState ? (
                    <EmptyState
                      title="No draft yet"
                      description="Choose files, then run the import to review a generated logic map here."
                    />
                  ) : (
                    <EditablePreviewTree
                      nodes={draftTree}
                      disabled={isApplying}
                      onRenameNode={onRenamePreviewNode}
                      onPromoteNode={onPromotePreviewNode}
                      onDemoteNode={onDemotePreviewNode}
                      onDeleteNode={onDeletePreviewNode}
                    />
                  )}
                </div>
              ) : (
                <div
                  role="tabpanel"
                  id="text-import-panel-merge"
                  aria-labelledby="text-import-tab-merge"
                  className={styles.reviewPanel}
                >
                  {isApplying ? (
                    <div className={styles.progressPanel}>
                      <div className={styles.progressPanelHeader}>
                        <div className={styles.headerCopy}>
                          <h4 className={styles.sectionTitle}>Applying changes</h4>
                          <p className={styles.sectionIntro}>{statusText || 'Applying the approved import changes.'}</p>
                        </div>
                        <span className={styles.inlineBadge}>
                          {appliedCount}/{Math.max(totalOperations, appliedCount)}
                        </span>
                      </div>
                      <div className={styles.progressTrack} aria-hidden="true">
                        <div className={styles.progressFill} style={{ width: `${applyProgress}%` }} />
                      </div>
                      <div className={styles.statusRow}>
                        <p className={styles.statusMeta}>Applying {appliedCount}/{totalOperations} operations</p>
                        {currentApplyLabel ? <p className={styles.statusMeta}>{currentApplyLabel}</p> : null}
                      </div>
                    </div>
                  ) : null}

                  {applyError ? (
                    <div className={styles.errorPanel}>
                      <p className={styles.error}>{applyError.summary}</p>
                      {applyError.meta ? <p className={styles.errorMeta}>{applyError.meta}</p> : null}
                      {applyError.detail ? <p className={styles.errorMeta}>Raw error: {applyError.detail}</p> : null}
                    </div>
                  ) : null}

                  {showMergeGeneratingState ? (
                    <EmptyState
                      title="Preparing merge review"
                      description="The merge checks will appear here after the logic map is ready and the draft is confirmed."
                    />
                  ) : showMergeBlockedState ? (
                    <EmptyState
                      title="Confirm the draft first"
                      description="Merge review stays locked until you confirm the logic map."
                    />
                  ) : showMergeNoReviewNeededState ? (
                    <EmptyState
                      title="No merge or conflict items to review"
                      description="This import can be applied without extra merge decisions."
                    />
                  ) : (
                    <>
                      {preview?.conflicts.length ? (
                        <div className={styles.reviewGroup}>
                          <h4 className={styles.reviewGroupTitle}>Conflicts</h4>
                          <div className={styles.conflictList}>
                            {preview.conflicts.map((conflict) => {
                              const checked = approvedConflictIds.includes(conflict.id)

                              return (
                                <label key={conflict.id} className={styles.conflictItem}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggleConflict(conflict.id)}
                                    disabled={isApplying}
                                  />
                                  <div>
                                    <div className={styles.conflictHeader}>
                                      <strong>{conflict.title}</strong>
                                      <span className={styles.conflictKind}>{conflict.kind.replace(/_/g, ' ')}</span>
                                    </div>
                                    <p className={styles.conflictDescription}>{conflict.description}</p>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}

                      {preview?.mergeSuggestions?.length ? (
                        <div className={styles.reviewGroup}>
                          <h4 className={styles.reviewGroupTitle}>Merge suggestions</h4>
                          <div className={styles.suggestionList}>
                            {preview.mergeSuggestions.map((suggestion) => (
                              <div key={suggestion.id} className={styles.suggestionItem}>
                                <div className={styles.conflictHeader}>
                                  <strong>{suggestion.matchedTopicTitle}</strong>
                                  <span className={styles.conflictKind}>{formatMergeConfidence(suggestion.confidence)}</span>
                                </div>
                                <p className={styles.conflictDescription}>{suggestion.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {crossFileMergeSuggestions.length ? (
                        <div className={styles.reviewGroup}>
                          <h4 className={styles.reviewGroupTitle}>Cross-file overlaps</h4>
                          <div className={styles.suggestionList}>
                            {crossFileMergeSuggestions.map((suggestion) => (
                              <div key={suggestion.id} className={styles.suggestionItem}>
                                <div className={styles.conflictHeader}>
                                  <strong>{suggestion.matchedTitle}</strong>
                                  <span className={styles.conflictKind}>{formatMergeConfidence(suggestion.confidence)}</span>
                                </div>
                                <p className={styles.conflictDescription}>
                                  {suggestion.sourceName} overlaps with {suggestion.matchedSourceName}. {suggestion.reason}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {preview?.warnings?.length ? (
                        <div className={styles.reviewGroup}>
                          <h4 className={styles.reviewGroupTitle}>Warnings</h4>
                          <ul className={styles.warningList}>
                            {preview.warnings.map((warning, index) => (
                              <li key={`${warning}-${index}`} className={styles.warningItem}>
                                {warning}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}

              <div className={styles.reviewFooter}>
                <div className={styles.treeBadgeRow}>
                  {reviewTab === 'draft' ? (
                    <span className={styles.reviewSummaryBadge}>{draftNodeCount} nodes</span>
                  ) : (
                    <>
                      <span className={styles.reviewSummaryBadge}>{pendingDecisionCount} decisions</span>
                      <span className={styles.reviewSummaryBadge}>{pendingWarningCount} warnings</span>
                    </>
                  )}
                </div>

                {reviewTab === 'draft' ? (
                  <Button tone="primary" onClick={handleConfirmDraft} disabled={!canConfirmDraft}>
                    {draftConfirmed ? 'Draft confirmed' : 'Confirm draft'}
                  </Button>
                ) : (
                  <Button
                    tone="primary"
                    onClick={onApply}
                    disabled={!mergeReviewReady || isApplying || (preview?.operations.length ?? 0) === 0}
                  >
                    {isApplying ? 'Applying changes...' : 'Apply to canvas'}
                  </Button>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </SurfacePanel>
    </div>
  )
}
