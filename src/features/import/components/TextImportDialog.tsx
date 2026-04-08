import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  TextImportArchetype,
  TextImportCrossFileMergeSuggestion,
  TextImportMergeSuggestion,
  TextImportPreset,
  TextImportPreviewNode,
  TextImportPreprocessHint,
  TextImportResponse,
  TextImportSourceType,
} from '../../../../shared/ai-contract'
import {
  formatTextImportArchetypeLabel,
  formatTextImportClassificationConfidence,
  formatTextImportPresetLabel,
  formatTextImportTemplateSlotLabel,
  resolveTextImportPlanningOptions,
  type TextImportSourcePlanningSummary,
} from '../../../../shared/text-import-semantics'
import { Button, IconButton, Input, SurfacePanel, TextArea } from '../../../components/ui'
import type { SemanticMergeStage } from '../local-text-import-core'
import type { TextImportJobMode, TextImportJobType } from '../text-import-job'
import type { TextImportAnchorMode, TextImportErrorState } from '../text-import-store'
import { preprocessTextToImportHints } from '../text-import-preprocess'
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
  onClose: () => void
  onChooseFile: () => void
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
}

const DIALOG_STEPS = [
  { id: 'source', label: 'Import source' },
  { id: 'structured', label: 'Draft review' },
  { id: 'merge', label: 'Merge review' },
] as const

type DialogStep = (typeof DIALOG_STEPS)[number]['id']

/*
const IMPORT_PRESETS: Array<{ id: TextImportPreset; label: string; description: string }> = [
  { id: 'preserve', label: '保真导入', description: '尽量保留原文层级和措辞。' },
  { id: 'distill', label: '智能提炼', description: '默认推荐，抽出摘要、决策、行动项和风险。' },
  { id: 'action_first', label: '行动项优先', description: '压缩结构，优先保留待办、决策和阻塞。' },
]

*/

function formatSemanticRole(role: TextImportPreviewNode['semanticRole']): string | null {
  switch (role) {
    case 'summary':
      return 'Summary'
    case 'decision':
      return 'Decision'
    case 'action':
      return 'Action'
    case 'risk':
      return 'Risk'
    case 'question':
      return 'Question'
    case 'metric':
      return 'Metric'
    case 'timeline':
      return 'Timeline'
    case 'evidence':
      return 'Evidence'
    case 'section':
      return 'Section'
    default:
      return null
  }
}
function formatTemplateSlot(slot: TextImportPreviewNode['templateSlot']): string | null {
  return formatTextImportTemplateSlotLabel(slot)
}

function formatPlanningConfidence(value: TextImportSourcePlanningSummary['confidence']): string {
  switch (value) {
    case 'high':
      return 'High confidence'
    case 'medium':
      return 'Medium confidence'
    case 'low':
    default:
      return 'Low confidence'
  }
}

const IMPORT_PRESET_OPTIONS: Array<{
  id: TextImportPreset | null
  label: string
  description: string
}> = [
  {
    id: null,
    label: 'Automatic',
    description: 'Default. Pick the import strategy from the source structure and semantic signals.',
  },
  {
    id: 'preserve',
    label: 'Preserve structure',
    description: 'Keep the original hierarchy and wording as much as possible.',
  },
  {
    id: 'distill',
    label: 'Smart distill',
    description: 'Default. Distill summaries, decisions, actions, and risks into a cleaner branch.',
  },
  {
    id: 'action_first',
    label: 'Action first',
    description: 'Compress structure and prioritize action items, decisions, and blockers.',
  },
]

const ARCHETYPE_OPTIONS: Array<{
  id: TextImportArchetype | null
  label: string
  description: string
}> = [
  {
    id: null,
    label: 'Auto detect',
    description: 'Use the local scorer first and only escalate when the content type is ambiguous.',
  },
  {
    id: 'method',
    label: 'Method',
    description: 'Extract goals, steps, criteria, prerequisites, and common mistakes.',
  },
  {
    id: 'argument',
    label: 'Argument',
    description: 'List viewpoints first, then attach supporting evidence and data.',
  },
  {
    id: 'plan',
    label: 'Plan',
    description: 'Focus on goals, strategy, actions, owners, timelines, risks, and success metrics.',
  },
  {
    id: 'report',
    label: 'Report',
    description: 'Group by summary, key results, progress, metrics, blockers, and next steps.',
  },
  {
    id: 'meeting',
    label: 'Meeting',
    description: 'Surface agenda, decisions, action items, owners, open questions, and risks.',
  },
  {
    id: 'postmortem',
    label: 'Postmortem',
    description: 'Extract issues, causes, impacts, evidence, fixes, and preventive actions.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    description: 'Organize definitions, components, mechanisms, comparisons, examples, and cautions.',
  },
  {
    id: 'mixed',
    label: 'Mixed',
    description: 'Keep a generic summary/themes/actions structure when the content type is blended.',
  },
]

function PreviewTree({ nodes }: { nodes: TextImportPreviewNode[] }) {
  if (nodes.length === 0) {
    return <p className={styles.empty}>No structured preview is available yet.</p>
  }

  return (
    <ul className={styles.treeList}>
      {nodes.map((node) => (
        <li key={node.id} className={styles.treeItem}>
          <div className={styles.treeCard} data-relation={node.relation}>
            <div className={styles.treeTitleRow}>
              <strong>{node.title}</strong>
              <div className={styles.treeBadgeRow}>
                {formatSemanticRole(node.semanticRole) ? (
                  <span className={styles.treeSemanticBadge}>{formatSemanticRole(node.semanticRole)}</span>
                ) : null}
                {formatTemplateSlot(node.templateSlot) ? (
                  <span className={styles.treeBadge}>{formatTemplateSlot(node.templateSlot)}</span>
                ) : null}
                {node.confidence ? (
                  <span className={styles.treeConfidenceBadge}>{node.confidence}</span>
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
          </div>
          {node.children.length > 0 ? <PreviewTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  )
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
            {formatTemplateSlot(node.templateSlot) ? (
              <span className={styles.treeBadge}>{formatTemplateSlot(node.templateSlot)}</span>
            ) : null}
            {node.confidence ? (
              <span className={styles.treeConfidenceBadge}>{node.confidence}</span>
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

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, '0')}s` : `${totalSeconds}s`
}

function formatSourceType(sourceType: TextImportSourceType | null): string {
  if (sourceType === 'file') {
    return 'File'
  }
  if (sourceType === 'paste') {
    return 'Pasted text'
  }
  return 'Unspecified'
}

function formatMergeConfidence(confidence: TextImportMergeSuggestion['confidence']): string {
  return confidence === 'high' ? 'High confidence' : 'Medium confidence'
}

function describeSemanticStage(stage: SemanticMergeStage): string {
  switch (stage) {
    case 'candidate_generation':
      return 'Generating semantic candidates'
    case 'adjudicating':
      return 'Reviewing semantic matches'
    case 'review_ready':
      return 'Semantic review ready'
    default:
      return 'Not started'
  }
}

function describePipeline(mode: TextImportJobMode | null): string {
  return mode === 'codex_import' ? 'Codex pipeline' : 'Local pipeline'
}

function createPrimaryErrorSummary(error: TextImportErrorState): string {
  if (error.code === 'invalid_request') {
    return 'The import request was rejected before preview generation.'
  }

  if (error.kind === 'bridge_unavailable') {
    return error.status === 502 || error.status === 503 || error.status === 504
      ? 'The local Codex bridge is unavailable.'
      : error.message
  }

  if (error.kind === 'bridge_internal_error') {
    return 'The local Codex bridge failed while building the import preview.'
  }

  if (error.code === 'request_failed') {
    return 'The local Codex bridge failed while building the import preview.'
  }

  return error.message
}

function createErrorDiagnostics(
  error: TextImportErrorState,
  currentFileName: string | null,
): { summary: string; meta: string | null; detail: string | null } {
  const summary = createPrimaryErrorSummary(error)
  const metaParts = [
    error.requestId ? `Request ${error.requestId}` : null,
    error.stage ? `Stage ${error.stage}` : null,
    currentFileName ? `File ${currentFileName}` : null,
    typeof error.status === 'number' ? `HTTP ${error.status}` : null,
  ].filter((part): part is string => Boolean(part))
  const detailSource = error.rawMessage ?? (error.message !== summary ? error.message : null)
  const detail =
    detailSource && detailSource !== summary
      ? detailSource
      : null

  return {
    summary,
    meta: metaParts.length > 0 ? metaParts.join(' | ') : null,
    detail,
  }
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}
    >
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TextImportDialog({
  open,
  sourceType,
  sourceFiles,
  draftSourceName,
  draftText,
  preview,
  draftTree,
  draftConfirmed,
  planningSummaries,
  crossFileMergeSuggestions,
  approvedConflictIds,
  statusText,
  progress,
  progressIndeterminate,
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
  presetOverride,
  archetypeOverride = null,
  anchorMode,
  documentRootLabel,
  currentSelectionLabel,
  onClose,
  onChooseFile,
  onPresetChange,
  onArchetypeChange = () => {},
  onAnchorModeChange,
  onDraftSourceNameChange,
  onDraftTextChange,
  onGenerateFromText,
  onToggleConflict,
  onConfirmDraft,
  onRenamePreviewNode,
  onPromotePreviewNode,
  onDemotePreviewNode,
  onDeletePreviewNode,
  onApply,
}: TextImportDialogProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [showFileDetails, setShowFileDetails] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [currentStep, setCurrentStep] = useState<DialogStep>(() => (isApplying ? 'merge' : 'source'))
  const previousPreviewingRef = useRef(isPreviewing)

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
      setCurrentStep('source')
      setShowFileDetails(false)
      setShowAdvancedSettings(false)
      previousPreviewingRef.current = isPreviewing
    }
  }, [open, isPreviewing])

  useEffect(() => {
    if (!open) {
      previousPreviewingRef.current = isPreviewing
      return
    }

    if (isPreviewing) {
      setCurrentStep('source')
    } else if (previousPreviewingRef.current && preview) {
      setCurrentStep('structured')
    } else if (!preview && !isApplying) {
      setCurrentStep('source')
    }

    previousPreviewingRef.current = isPreviewing
  }, [open, isPreviewing, preview, isApplying])

  useEffect(() => {
    if (open && isApplying) {
      setCurrentStep('merge')
    }
  }, [open, isApplying])

  const isFileImportSource =
    sourceType === 'file' || (sourceFiles.length > 0 && sourceFiles.every((file) => file.sourceType === 'file'))
  const showGenerateAction = !isFileImportSource
  const showSourceEditor = !isFileImportSource
  const showPipelinePanel = Boolean(modeHint || statusText || preview?.summary || isPreviewing || isApplying)
  const sourceSnapshotTitle = sourceFiles.length > 1 ? `${sourceFiles.length} files selected` : `${sourceFiles.length} file selected`
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
  const showMergeIdleState = !isPreviewing && !previewReady
  const showMergeBlockedState = !isPreviewing && previewReady && !mergeReviewReady
  const showMergeNoReviewNeededState = mergeReviewReady && !hasMergeReviewContent
  const classification = preview?.classification ?? null
  const templateSummary = preview?.templateSummary ?? null
  const classificationConfidence = classification
    ? formatTextImportClassificationConfidence(classification.confidence)
    : null
  const draftPlanningSummary = useMemo(() => {
    if (planningSummaries.length > 0 || isFileImportSource) {
      return null
    }

    const normalizedDraftText = draftText.replace(/\r\n?/g, '\n').trim()
    if (!normalizedDraftText) {
      return null
    }

    const draftSource = draftSourceName.trim() || 'Pasted text'
    return resolveTextImportPlanningOptions({
      sourceName: draftSource,
      sourceType: 'paste',
      preprocessedHints: preprocessTextToImportHints(normalizedDraftText),
      presetOverride,
      archetypeOverride,
    }).summary
  }, [
    planningSummaries,
    isFileImportSource,
    draftText,
    draftSourceName,
    presetOverride,
    archetypeOverride,
  ])
  const effectivePlanningSummaries =
    planningSummaries.length > 0 ? planningSummaries : draftPlanningSummary ? [draftPlanningSummary] : []
  const hasPlanningSummary = effectivePlanningSummaries.length > 0
  const hasLowConfidencePlanning = effectivePlanningSummaries.some(
    (summary) => !summary.isManual && summary.confidence === 'low',
  )
  const isBatchPlanning = effectivePlanningSummaries.length > 1
  const primaryPlanningSummary = effectivePlanningSummaries[0] ?? null
  const selectedPresetOption =
    IMPORT_PRESET_OPTIONS.find((option) => option.id === presetOverride) ?? IMPORT_PRESET_OPTIONS[0]
  const selectedArchetypeOption =
    ARCHETYPE_OPTIONS.find((option) => option.id === archetypeOverride) ?? ARCHETYPE_OPTIONS[0]

  function canNavigateToStep(step: DialogStep): boolean {
    if (step === 'merge' && !isApplying && !draftConfirmed) {
      return false
    }
    return step !== currentStep
  }

  function handleStepChange(step: DialogStep): void {
    if (step === currentStep || !canNavigateToStep(step)) {
      return
    }
    setCurrentStep(step)
  }

  function handleBack(): void {
    if (currentStep === 'merge') {
      setCurrentStep('structured')
      return
    }

    if (currentStep === 'structured') {
      setCurrentStep('source')
    }
  }

  function handleNext(): void {
    if (currentStep === 'source') {
      setCurrentStep('structured')
      return
    }

    if (currentStep === 'structured') {
      onConfirmDraft()
      setCurrentStep('merge')
    }
  }

  const showCloseAction = currentStep === 'source'
  const showBackAction = currentStep !== 'source'
  const showNextAction = currentStep === 'source' || currentStep === 'structured'
  const nextActionLabel =
    currentStep === 'structured' && !draftConfirmed ? 'Confirm draft' : 'Next'

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
          <div>
            <p className={styles.eyebrow}>Smart Import</p>
            <h2 id="text-import-title" className={styles.title}>
              Smart import draft
            </h2>
          </div>
          <IconButton label="Close import draft" icon="close" tone="primary" size="sm" onClick={onClose} />
        </div>

        <nav className={styles.stepper} aria-label="Import steps">
          {DIALOG_STEPS.map((step, index) => {
            const isCurrent = step.id === currentStep

            return (
              <button
                key={step.id}
                type="button"
                className={styles.stepButton}
                data-current={isCurrent}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => handleStepChange(step.id)}
              >
                <span className={styles.stepMarker}>{index + 1}</span>
                <span className={styles.stepText}>
                  <span className={styles.stepEyebrow}>Step {index + 1}</span>
                  <span className={styles.stepLabel}>{step.label}</span>
                </span>
              </button>
            )
          })}
        </nav>

        <div className={styles.pageViewport}>
          {currentStep === 'source' ? (
            <>
              <section className={styles.inputPanel}>
                <div className={styles.inputHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>Import source</h3>
                    <p className={styles.empty}>
                      Upload Markdown or plain text files, or paste text directly below.
                    </p>
                  </div>
                  <Button tone="primary" onClick={onChooseFile} disabled={isPreviewing || isApplying} size="sm">
                    Choose Files
                  </Button>
                </div>

                <section className={styles.anchorPanel} aria-label="Import target">
                  <div className={styles.inputGrid}>
                    <label className={styles.sourceField}>
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
                          ? 'Default. Each new import starts at the document root so repeated imports stay as sibling branches.'
                          : 'Import under the currently selected topic. This can intentionally nest the next imported branch.'}
                      </span>
                    </label>
                  </div>
                  {anchorMode === 'current_selection' ? (
                    <p className={styles.anchorWarning}>
                      The next import will be nested under the currently selected topic instead of the document root.
                    </p>
                  ) : null}
                </section>

                {hasPlanningSummary ? (
                  <section className={styles.autoSetupPanel} aria-label="Automatic import setup">
                    <div className={styles.autoSetupHeader}>
                      <div>
                        <span className={styles.metaLabel}>Automatic import setup</span>
                        <h4 className={styles.autoSetupTitle}>
                          {isBatchPlanning ? 'Per-file automatic selection' : 'Automatic import setup'}
                        </h4>
                      </div>
                      <span className={styles.autoSetupBadge}>
                        {primaryPlanningSummary?.isManual ? 'Manual override' : 'Auto selected'}
                      </span>
                    </div>

                    {isBatchPlanning ? (
                      <>
                        <div className={styles.metaGrid}>
                          <div className={styles.metaCard}>
                            <span className={styles.metaLabel}>Strategy</span>
                            <strong>Per file</strong>
                          </div>
                          <div className={styles.metaCard}>
                            <span className={styles.metaLabel}>Archetype</span>
                            <strong>Per file</strong>
                          </div>
                          <div className={styles.metaCard}>
                            <span className={styles.metaLabel}>Confidence</span>
                            <strong>{hasLowConfidencePlanning ? 'Mixed confidence' : 'Stable'}</strong>
                          </div>
                        </div>
                        <p className={styles.summaryText}>
                          Each file is classified independently before building the batch preview.
                          {hasLowConfidencePlanning
                            ? ' Some files are low-confidence, so you can adjust the defaults in Advanced settings.'
                            : ''}
                        </p>
                      </>
                    ) : primaryPlanningSummary ? (
                      <>
                        <div className={styles.metaGrid}>
                          <div className={styles.metaCard}>
                            <span className={styles.metaLabel}>Strategy</span>
                            <strong>{formatTextImportPresetLabel(primaryPlanningSummary.resolvedPreset)}</strong>
                          </div>
                          <div className={styles.metaCard}>
                            <span className={styles.metaLabel}>Archetype</span>
                            <strong>{formatTextImportArchetypeLabel(primaryPlanningSummary.resolvedArchetype)}</strong>
                          </div>
                          <div className={styles.metaCard}>
                            <span className={styles.metaLabel}>
                              {primaryPlanningSummary.isManual ? 'Status' : 'Confidence'}
                            </span>
                            <strong>
                              {primaryPlanningSummary.isManual
                                ? 'Manual override'
                                : formatPlanningConfidence(primaryPlanningSummary.confidence)}
                            </strong>
                          </div>
                        </div>
                        <p className={styles.summaryText}>{primaryPlanningSummary.rationale}</p>
                        {!primaryPlanningSummary.isManual && primaryPlanningSummary.confidence === 'low' ? (
                          <p className={styles.autoSetupHint}>
                            The system already chose a default setup. You can refine it in Advanced settings.
                          </p>
                        ) : null}
                      </>
                    ) : null}

                    <div className={styles.advancedPanel}>
                      <button
                        type="button"
                        className={styles.advancedToggle}
                        aria-expanded={showAdvancedSettings}
                        onClick={() => setShowAdvancedSettings((value) => !value)}
                      >
                        <span>Advanced settings</span>
                        <ChevronIcon expanded={showAdvancedSettings} />
                      </button>
                      {showAdvancedSettings ? (
                        <div className={styles.advancedContent}>
                          <div className={styles.inputGrid}>
                            <label className={styles.sourceField}>
                              <span className={styles.metaLabel}>Import strategy</span>
                              <select
                                className={styles.select}
                                value={presetOverride ?? 'auto'}
                                onChange={(event) =>
                                  onPresetChange(
                                    event.target.value === 'auto'
                                      ? null
                                      : (event.target.value as TextImportPreset),
                                  )
                                }
                                disabled={isPreviewing || isApplying}
                              >
                                {IMPORT_PRESET_OPTIONS.map((option) => (
                                  <option key={option.id ?? 'auto'} value={option.id ?? 'auto'}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <span className={styles.selectDescription}>
                                {selectedPresetOption.description}
                              </span>
                            </label>
                            <label className={styles.sourceField}>
                              <span className={styles.metaLabel}>Content archetype</span>
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
                              <span className={styles.selectDescription}>
                                {selectedArchetypeOption.description}
                              </span>
                            </label>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {showSourceEditor ? (
                  <>
                    <div className={styles.inputGrid}>
                      <div className={styles.sourceField}>
                        <span className={styles.metaLabel}>Source name</span>
                        <Input
                          value={draftSourceName}
                          placeholder="Example: GTM_main.md"
                          onChange={(event) => onDraftSourceNameChange(event.target.value)}
                          disabled={isPreviewing || isApplying || jobType === 'batch'}
                        />
                      </div>
                      <div className={styles.sourceField}>
                        <span className={styles.metaLabel}>Source type</span>
                        <div className={styles.sourceTypeValue}>{formatSourceType(sourceType)}</div>
                      </div>
                    </div>

                    <TextArea
                      className={styles.textArea}
                      value={draftText}
                      placeholder="Paste Markdown or plain text here and generate an import preview."
                      onChange={(event) => onDraftTextChange(event.target.value)}
                      disabled={isPreviewing || isApplying || jobType === 'batch'}
                    />
                  </>
                ) : (
                  <div className={styles.sourceFileBar}>
                    <div className={styles.sourceFileRow}>
                      <span className={styles.sourceFileCount}>{sourceSnapshotTitle}</span>
                      <button
                        type="button"
                        className={styles.expandButton}
                        onClick={() => setShowFileDetails(!showFileDetails)}
                        aria-expanded={showFileDetails}
                        title={showFileDetails ? 'Hide file details' : 'Show file details'}
                      >
                        <ChevronIcon expanded={showFileDetails} />
                      </button>
                    </div>
                    {showFileDetails && (
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
                                    {formatTextImportPresetLabel(planningSummary.resolvedPreset)}
                                    {' · '}
                                    {formatTextImportArchetypeLabel(planningSummary.resolvedArchetype)}
                                    {' · '}
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
                    )}
                  </div>
                )}

                {showGenerateAction ? (
                  <div className={styles.inputActions}>
                    <Button
                      tone="primary"
                      onClick={onGenerateFromText}
                      disabled={isPreviewing || isApplying || !draftText.trim() || jobType === 'batch'}
                    >
                      {isPreviewing ? 'Generating draft...' : 'Generate draft'}
                    </Button>
                  </div>
                ) : null}
              </section>

              {showPipelinePanel ? (
                <section className={styles.progressPanel}>
                  <div className={styles.progressPanelHeader}>
                    <div>
                      <h3 className={styles.sectionTitle}>Import progress</h3>
                      <p className={styles.empty}>Follow the current pipeline status and review progress.</p>
                    </div>
                  </div>

                  <div className={styles.statusPanel}>
                    {modeHint ? (
                      <div className={styles.statusHeader}>
                        <span className={styles.statusBadge}>{describePipeline(jobMode)}</span>
                        <p className={styles.statusHint}>{modeHint}</p>
                      </div>
                    ) : null}
                    {statusText ? <p className={styles.status}>{statusText}</p> : null}
                    {(isPreviewing || statusText) ? (
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
                        {jobMode === 'local_markdown' ? (
                          <div className={styles.statusDetailGrid}>
                            <p className={styles.statusMeta}>Semantic stage: {describeSemanticStage(semanticMergeStage)}</p>
                            {(semanticCandidateCount > 0 || semanticAdjudicatedCount > 0) ? (
                              <p className={styles.statusMeta}>
                                Candidates {semanticCandidateCount}/{semanticAdjudicatedCount}
                                {semanticFallbackCount > 0 ? ` | Fallbacks ${semanticFallbackCount}` : ''}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                      </>
                    ) : null}
                    {preview?.summary ? <p className={styles.summaryText}>{preview.summary}</p> : null}
                    {classification ? (
                      <div className={styles.metaGrid}>
                        <div className={styles.metaCard}>
                          <span className={styles.metaLabel}>Detected archetype</span>
                          <strong>{formatTextImportArchetypeLabel(classification.archetype)}</strong>
                        </div>
                        <div className={styles.metaCard}>
                          <span className={styles.metaLabel}>Confidence</span>
                          <strong>
                            {classificationConfidence ?? 'low'} ({Math.round(classification.confidence * 100)}%)
                          </strong>
                        </div>
                        {classification.secondaryArchetype ? (
                          <div className={styles.metaCard}>
                            <span className={styles.metaLabel}>Secondary signal</span>
                            <strong>{formatTextImportArchetypeLabel(classification.secondaryArchetype)}</strong>
                          </div>
                        ) : null}
                        <div className={styles.metaCard}>
                          <span className={styles.metaLabel}>Why this template</span>
                          <span>{classification.rationale}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {sourceError ? (
                <div className={styles.errorPanel}>
                  <p className={styles.error}>{sourceError.summary}</p>
                  {sourceError.meta ? <p className={styles.errorMeta}>{sourceError.meta}</p> : null}
                  {sourceError.detail ? <p className={styles.errorMeta}>Raw error: {sourceError.detail}</p> : null}
                </div>
              ) : null}
            </>
          ) : null}

          {currentStep === 'structured' ? (
            <section className={`${styles.section} ${styles.pageSection}`}>
              <h3 className={styles.sectionTitle}>Structure draft</h3>
              {classification ? (
                <div className={styles.metaGrid}>
                  <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>Template</span>
                    <strong>{formatTextImportArchetypeLabel(classification.archetype)}</strong>
                  </div>
                  <div className={styles.metaCard}>
                    <span className={styles.metaLabel}>Confidence</span>
                    <strong>
                      {classificationConfidence ?? 'low'} ({Math.round(classification.confidence * 100)}%)
                    </strong>
                  </div>
                  {templateSummary ? (
                    <div className={styles.metaCard}>
                      <span className={styles.metaLabel}>Visible slots</span>
                      <span>
                        {templateSummary.visibleSlots.map((slot) => formatTextImportTemplateSlotLabel(slot)).join(', ') || 'None'}
                      </span>
                    </div>
                  ) : null}
                  {templateSummary ? (
                    <div className={styles.metaCard}>
                      <span className={styles.metaLabel}>Folded slots</span>
                      <span>
                        {templateSummary.foldedSlots.map((slot) => formatTextImportTemplateSlotLabel(slot)).join(', ') || 'None'}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {showStructuredGeneratingState ? (
                <EmptyState
                  title="Generating structure draft"
                  description="The structure draft is still being generated. Keep this step open or switch back later to review the result."
                />
              ) : showStructuredEmptyState ? (
                <EmptyState
                  title="No structure draft yet"
                  description="Generate a draft from Step 1 to review the organized hierarchy here."
                />
              ) : isPreviewing || isApplying ? (
                <PreviewTree nodes={draftTree} />
              ) : (
                <EditablePreviewTree
                  nodes={draftTree}
                  disabled={isPreviewing || isApplying}
                  onRenameNode={onRenamePreviewNode}
                  onPromoteNode={onPromotePreviewNode}
                  onDemoteNode={onDemotePreviewNode}
                  onDeleteNode={onDeletePreviewNode}
                />
              )}
            </section>
          ) : null}

          {currentStep === 'merge' ? (
            <>
              {isApplying ? (
                <div className={styles.statusPanel}>
                  <div className={styles.statusHeader}>
                    <span className={styles.statusBadge}>Applying changes</span>
                    <p className={styles.statusHint}>Applying the approved import operations to the current canvas.</p>
                  </div>
                  {statusText ? <p className={styles.status}>{statusText}</p> : null}
                  <div className={styles.progressTrack} aria-hidden="true">
                    <div className={styles.progressFill} style={{ width: `${displayProgress}%` }} />
                  </div>
                  <div className={styles.statusDetailGrid}>
                    <p className={styles.statusMeta}>
                      Applying {appliedCount}/{totalOperations || 0} operations
                    </p>
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

              <section className={`${styles.section} ${styles.pageSection}`}>
                <h3 className={styles.sectionTitle}>Merge review</h3>
                {showMergeGeneratingState ? (
                  <EmptyState
                    title="Generating merge review"
                    description="Merge suggestions and conflicts will appear here once the draft is confirmed."
                  />
                ) : showMergeIdleState ? (
                  <EmptyState
                    title="No merge review content yet"
                    description="Generate a draft from Step 1 to review merge suggestions and conflicts here."
                  />
                ) : showMergeBlockedState ? (
                  <EmptyState
                    title="Confirm the draft first"
                    description="Review and confirm the structure draft in Step 2 before opening merge review."
                  />
                ) : showMergeNoReviewNeededState ? (
                  <EmptyState
                    title="No merge or conflict items to review"
                    description="This preview is ready, and there are no merge suggestions, conflicts, or warnings that need attention."
                  />
                ) : null}

                {preview?.mergeSuggestions?.length ? (
                  <div className={styles.suggestionList}>
                    {preview.mergeSuggestions.map((suggestion) => (
                      <div key={suggestion.id} className={styles.suggestionItem}>
                        <div className={styles.conflictHeader}>
                          <strong>{suggestion.matchedTopicTitle}</strong>
                          <span className={styles.conflictKind}>{formatMergeConfidence(suggestion.confidence)}</span>
                        </div>
                        <p className={styles.conflictDescription}>
                          {suggestion.kind ? `${suggestion.kind}: ` : ''}
                          {suggestion.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {crossFileMergeSuggestions.length ? (
                  <div className={styles.warningList}>
                    {crossFileMergeSuggestions.map((suggestion) => (
                      <p key={suggestion.id} className={styles.warningItem}>
                        {suggestion.sourceName} to {suggestion.matchedSourceName}: {suggestion.reason}
                      </p>
                    ))}
                  </div>
                ) : null}

                {preview?.conflicts.length ? (
                  <div className={styles.conflictList}>
                    {preview.conflicts.map((conflict) => {
                      const checked = approvedConflictIds.includes(conflict.id)
                      return (
                        <label key={conflict.id} className={styles.conflictItem}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleConflict(conflict.id)}
                          />
                          <div>
                            <div className={styles.conflictHeader}>
                              <strong>{conflict.title}</strong>
                              <span className={styles.conflictKind}>{conflict.kind}</span>
                            </div>
                            <p className={styles.conflictDescription}>{conflict.description}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                ) : null}

                {preview?.warnings?.length ? (
                  <div className={styles.warningList}>
                    {preview.warnings.map((warning) => (
                      <p key={warning} className={styles.warningItem}>
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerGroup}>
            {showCloseAction ? (
              <Button tone="primary" onClick={onClose} disabled={isApplying}>
                Close
              </Button>
            ) : null}
            {showBackAction ? (
              <Button tone="primary" iconStart="back" onClick={handleBack} disabled={isApplying}>
                Back
              </Button>
            ) : null}
          </div>
          <div className={styles.footerGroup}>
            {showNextAction ? (
              <Button
                tone="primary"
                iconEnd="chevronRight"
                onClick={handleNext}
                disabled={
                  isApplying ||
                  (currentStep === 'structured' && !hasStructuredPreview) ||
                  (currentStep === 'source' && isPreviewing)
                }
              >
                {nextActionLabel}
              </Button>
            ) : null}
            {currentStep === 'merge' ? (
              <Button
                tone="primary"
                iconStart="document"
                onClick={onApply}
                disabled={!preview || !draftConfirmed || isPreviewing || isApplying}
              >
                {isApplying ? 'Applying...' : 'Apply to canvas'}
              </Button>
            ) : null}
          </div>
        </div>
      </SurfacePanel>
    </div>
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
