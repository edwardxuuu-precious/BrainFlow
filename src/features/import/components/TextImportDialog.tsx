import { useEffect, useRef, useState } from 'react'
import type {
  TextImportConflict,
  TextImportCrossFileMergeSuggestion,
  TextImportMergeSuggestion,
  TextImportPreviewNode,
  TextImportPreprocessHint,
  TextImportSourceType,
} from '../../../../shared/ai-contract'
import { Button, IconButton, Input, SurfacePanel, TextArea } from '../../../components/ui'
import type { SemanticMergeStage } from '../local-text-import-core'
import type { TextImportJobMode, TextImportJobType } from '../text-import-job'
import type {
  TextImportCurrentStatus,
  TextImportCodexDiagnosticState,
  TextImportCodexEventState,
  TextImportCodexExplainerState,
  TextImportErrorState,
  TextImportRunnerObservationState,
  TextImportStatusTimelineEntry,
} from '../text-import-store'
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
  preview: {
    summary: string
    conflicts: TextImportConflict[]
    operations: Array<{ risk: 'low' | 'high' }>
    mergeSuggestions?: TextImportMergeSuggestion[]
    warnings?: string[]
  } | null
  previewTree: TextImportPreviewNode[]
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
  currentStatus: TextImportCurrentStatus | null
  latestCodexExplainer: TextImportCodexExplainerState | null
  latestCodexEvent: TextImportCodexEventState | null
  codexEventFeed: TextImportCodexEventState[]
  codexDiagnostics: TextImportCodexDiagnosticState[]
  statusTimeline: TextImportStatusTimelineEntry[]
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
  onClose: () => void
  onChooseFile: () => void
  onDraftSourceNameChange: (value: string) => void
  onDraftTextChange: (value: string) => void
  onGenerateFromText: () => void
  onToggleConflict: (conflictId: string) => void
  onApply: () => void
}

const DIALOG_STEPS = [
  { id: 'source', label: 'Import source' },
  { id: 'structured', label: 'Structured preview' },
  { id: 'merge', label: 'Merge review' },
] as const

type DialogStep = (typeof DIALOG_STEPS)[number]['id']

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
              <span className={styles.treeBadge}>
                {node.relation === 'new'
                  ? 'New branch'
                  : node.relation === 'merge'
                    ? 'Semantic merge'
                    : 'Conflict'}
              </span>
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

function describeStage(stage: TextImportStatusTimelineEntry['stage']): string {
  switch (stage) {
    case 'extracting_input':
      return 'Extract input'
    case 'analyzing_source':
      return 'Build context'
    case 'loading_prompt':
      return 'Load prompt'
    case 'starting_codex_primary':
      return 'Start Codex'
    case 'waiting_codex_primary':
      return 'Primary run'
    case 'parsing_primary_result':
      return 'Parse primary result'
    case 'repairing_structure':
      return 'Prepare repair'
    case 'starting_codex_repair':
      return 'Start repair'
    case 'waiting_codex_repair':
      return 'Repair run'
    case 'parsing_repair_result':
      return 'Parse repair result'
    case 'resolving_conflicts':
      return 'Resolve conflicts'
    case 'building_preview':
      return 'Build preview'
    case 'parsing_markdown':
      return 'Parse Markdown'
    case 'analyzing_import':
      return 'Analyze import'
    case 'semantic_candidate_generation':
      return 'Generate semantic candidates'
    case 'semantic_adjudication':
      return 'Adjudicate semantic matches'
    case 'semantic_merge_review':
      return 'Finalize semantic review'
    default:
      return stage
  }
}

function describeRunnerPhase(
  observation: Pick<
    TextImportRunnerObservationState,
    'phase' | 'elapsedSinceSpawnMs' | 'elapsedSinceLastEventMs' | 'hadJsonEvent'
  >,
): string {
  switch (observation.phase) {
    case 'spawn_started':
      return 'Spawn started'
    case 'heartbeat':
      if (observation.hadJsonEvent === false) {
        return observation.elapsedSinceSpawnMs !== undefined
          ? `Waiting for first event after ${formatElapsed(observation.elapsedSinceSpawnMs)}`
          : 'Waiting for first event'
      }

      return observation.elapsedSinceLastEventMs !== undefined
        ? `Still running after ${formatElapsed(observation.elapsedSinceSpawnMs ?? 0)} | No new events for ${formatElapsed(observation.elapsedSinceLastEventMs)}`
        : observation.elapsedSinceSpawnMs !== undefined
          ? `Still running after ${formatElapsed(observation.elapsedSinceSpawnMs)}`
          : 'Still running'
    case 'first_json_event':
      return observation.elapsedSinceSpawnMs !== undefined
        ? `First event after ${formatElapsed(observation.elapsedSinceSpawnMs)}`
        : 'First event received'
    case 'completed':
      return observation.hadJsonEvent === false
        ? 'Runner completed without JSON events'
        : observation.elapsedSinceSpawnMs !== undefined
          ? `Runner completed in ${formatElapsed(observation.elapsedSinceSpawnMs)}`
          : 'Runner completed'
    default:
      return observation.phase
  }
}

function describeRunnerStatus(
  currentStatus: TextImportCurrentStatus | null,
  statusTimeline: TextImportStatusTimelineEntry[],
): string {
  const latestObservation = getLatestRunnerObservation(currentStatus, statusTimeline)

  if (!latestObservation) {
    return 'Waiting for Codex runner observations'
  }

  const promptSummary = `${latestObservation.promptLength.toLocaleString()} chars`
  const phaseSummary = describeRunnerPhase(latestObservation)
  return `${phaseSummary} | Prompt ${promptSummary}`
}

function getLatestRunnerObservation(
  currentStatus: TextImportCurrentStatus | null,
  statusTimeline: TextImportStatusTimelineEntry[],
):
  | (Pick<TextImportRunnerObservationState, 'phase' | 'elapsedSinceSpawnMs' | 'elapsedSinceLastEventMs' | 'hadJsonEvent' | 'promptLength' | 'attempt' | 'requestId'> & {
      at: number
    })
  | null {
  if (currentStatus?.kind === 'runner_observation') {
    return currentStatus
  }

  const latestObservation = statusTimeline
    .flatMap((entry) => entry.runnerObservations)
    .at(-1)

  if (!latestObservation) {
    return null
  }

  return {
    ...latestObservation,
    at: latestObservation.observedAt,
  }
}

function describeCodexAttempt(attempt: TextImportCodexEventState['attempt']): string {
  return attempt === 'repair' ? 'Repair run' : 'Primary run'
}

function describeCodexFeedHeadline(
  latestCodexEvent: TextImportCodexEventState | null,
  latestObservation: ReturnType<typeof getLatestRunnerObservation>,
): string {
  if (latestCodexEvent) {
    return latestCodexEvent.summary
  }

  if (latestObservation) {
    return 'Codex 已开始，但暂时没有新的 CLI 事件。'
  }

  return '正在等待 Codex CLI 事件…'
}

function describeCodexFeedSilence(
  latestCodexEvent: TextImportCodexEventState | null,
  latestObservation: ReturnType<typeof getLatestRunnerObservation>,
  nowMs: number,
): string | null {
  if (latestCodexEvent) {
    return `No new Codex events for ${formatElapsed(Math.max(0, nowMs - latestCodexEvent.at))}`
  }

  if (latestObservation?.phase === 'heartbeat' && latestObservation.elapsedSinceLastEventMs !== undefined) {
    return latestObservation.hadJsonEvent === false
      ? `Waiting for first CLI event for ${formatElapsed(latestObservation.elapsedSinceLastEventMs)}`
      : `No new Codex events for ${formatElapsed(latestObservation.elapsedSinceLastEventMs)}`
  }

  if (latestObservation?.phase === 'spawn_started') {
    return 'Waiting for first CLI event'
  }

  return null
}

function describeTimelineDuration(
  entry: TextImportStatusTimelineEntry,
  nowMs: number,
): string {
  const endAt = entry.completedAt ?? nowMs
  const duration = Math.max(0, endAt - entry.startedAt)
  if (entry.completedAt !== null && duration < 1_000) {
    return '<1s'
  }
  return entry.completedAt === null ? `${formatElapsed(duration)} active` : formatElapsed(duration)
}

function createCodexFeedHeadlineText(
  latestCodexEvent: TextImportCodexEventState | null,
  latestObservation: ReturnType<typeof getLatestRunnerObservation>,
): string {
  if (latestCodexEvent) {
    return latestCodexEvent.summary
  }

  if (latestObservation) {
    return 'Codex has started, but no new CLI events have arrived yet.'
  }

  return 'Waiting for Codex CLI events...'
}

function createExplainerFallback(
  latestObservation: ReturnType<typeof getLatestRunnerObservation>,
): {
  attempt?: TextImportCodexEventState['attempt']
  headline: string
  reason: string
  evidence: string[]
} {
  if (!latestObservation) {
    return {
      headline: 'Waiting for runtime explanation',
      reason: 'Codex has not produced enough runtime signals yet.',
      evidence: ['Waiting for the first runner observation or CLI event'],
    }
  }

  if (latestObservation.hadJsonEvent === false) {
    return {
      attempt: latestObservation.attempt,
      headline: 'Waiting for the first Codex CLI event',
      reason:
        'The runner has started, but no real CLI event has arrived yet, so the explanation is still based on runner state only.',
      evidence: [
        `Attempt ${latestObservation.attempt === 'repair' ? 'repair' : 'primary'}`,
        `Prompt ${latestObservation.promptLength.toLocaleString()} chars`,
      ],
    }
  }

  return {
    attempt: latestObservation.attempt,
    headline: 'Waiting for the latest runtime explanation',
    reason: 'The runner is active, but the explainer has not published a newer inference yet.',
    evidence: [
      `Attempt ${latestObservation.attempt === 'repair' ? 'repair' : 'primary'}`,
      `Prompt ${latestObservation.promptLength.toLocaleString()} chars`,
    ],
  }
}

function describeDiagnosticCategory(
  category: TextImportCodexDiagnosticState['category'],
): string {
  switch (category) {
    case 'actionable':
      return 'Actionable diagnostics'
    case 'capability_gap':
      return 'Capability gaps'
    case 'noise':
      return 'Noise diagnostics'
    default:
      return category
  }
}

function groupCodexDiagnostics(
  diagnostics: TextImportCodexDiagnosticState[] | undefined,
): Record<TextImportCodexDiagnosticState['category'], TextImportCodexDiagnosticState[]> {
  return (diagnostics ?? []).reduce(
    (groups, diagnostic) => {
      groups[diagnostic.category].push(diagnostic)
      return groups
    },
    {
      actionable: [] as TextImportCodexDiagnosticState[],
      capability_gap: [] as TextImportCodexDiagnosticState[],
      noise: [] as TextImportCodexDiagnosticState[],
    },
  )
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
  previewTree,
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
  currentStatus,
  latestCodexExplainer,
  latestCodexEvent,
  codexEventFeed,
  codexDiagnostics,
  statusTimeline,
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
  onClose,
  onChooseFile,
  onDraftSourceNameChange,
  onDraftTextChange,
  onGenerateFromText,
  onToggleConflict,
  onApply,
}: TextImportDialogProps) {
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [showFileDetails, setShowFileDetails] = useState(false)
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

  if (!open) {
    return null
  }

  const isFileImportSource =
    sourceType === 'file' || (sourceFiles.length > 0 && sourceFiles.every((file) => file.sourceType === 'file'))
  const showGenerateAction = !isFileImportSource
  const showSourceEditor = !isFileImportSource
  const showPipelinePanel = Boolean(modeHint || statusText || preview?.summary || isPreviewing || isApplying || statusTimeline.length > 0)
  const sourceSnapshotTitle = sourceFiles.length > 1 ? `${sourceFiles.length} files selected` : `${sourceFiles.length} file selected`
  const elapsedMs =
    previewStartedAt === null
      ? 0
      : (isPreviewing ? nowMs : (previewFinishedAt ?? nowMs)) - previewStartedAt
  const displayProgress = isApplying ? applyProgress : progress
  const runnerStatus = describeRunnerStatus(currentStatus, statusTimeline)
  const latestRunnerObservation = getLatestRunnerObservation(currentStatus, statusTimeline)
  const showTimeline = statusTimeline.length > 0
  const showCodexLiveFeed = jobMode === 'codex_import'
  const codexFeedHeadline =
    createCodexFeedHeadlineText(latestCodexEvent, latestRunnerObservation) ||
    describeCodexFeedHeadline(latestCodexEvent, latestRunnerObservation)
  const codexFeedSilence = describeCodexFeedSilence(latestCodexEvent, latestRunnerObservation, nowMs)
  const codexExplainer =
    latestCodexExplainer ?? createExplainerFallback(latestRunnerObservation)
  const codexFeedItems = [...codexEventFeed].reverse()
  const groupedCodexDiagnostics = groupCodexDiagnostics(codexDiagnostics)
  const showDiagnosticsPanel = showTimeline || codexDiagnostics.length > 0
  const previewReady = Boolean(preview)
  const statusSummary = isApplying
    ? `Progress ${displayProgress}%`
    : progressIndeterminate
    ? `Working | Elapsed ${formatElapsed(elapsedMs)}`
    : `Progress ${displayProgress}% | Elapsed ${formatElapsed(elapsedMs)}`
  const errorDisplay = error ? createErrorDiagnostics(error, currentFileName) : null
  const sourceError = error?.stage === 'applying_changes' ? null : errorDisplay
  const applyError = error?.stage === 'applying_changes' ? errorDisplay : null
  const hasStructuredPreview = previewTree.length > 0
  const hasMergeReviewContent = Boolean(
    preview?.mergeSuggestions?.length ||
      crossFileMergeSuggestions.length ||
      preview?.conflicts.length ||
      preview?.warnings?.length,
  )
  const showStructuredGeneratingState = isPreviewing && !hasStructuredPreview
  const showStructuredEmptyState = !isPreviewing && !hasStructuredPreview
  const showMergeGeneratingState = isPreviewing && !previewReady
  const showMergeIdleState = !isPreviewing && !previewReady
  const showMergeNoReviewNeededState = previewReady && !hasMergeReviewContent

  function canNavigateToStep(step: DialogStep): boolean {
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
      setCurrentStep('merge')
    }
  }

  const showCloseAction = currentStep === 'source'
  const showBackAction = currentStep !== 'source'
  const showNextAction = currentStep === 'source' || currentStep === 'structured'

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
              Markdown import preview
            </h2>
          </div>
          <IconButton label="Close import preview" icon="close" tone="primary" size="sm" onClick={onClose} />
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
                        {sourceFiles.map((file) => (
                          <div key={file.sourceName} className={styles.fileListItem}>
                            <span className={styles.fileName}>{file.sourceName}</span>
                            <span className={styles.fileLength}>{file.textLength} chars</span>
                          </div>
                        ))}
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
                      {isPreviewing ? 'Generating preview...' : 'Generate preview'}
                    </Button>
                  </div>
                ) : null}
              </section>

              {showPipelinePanel ? (
                <section className={styles.progressPanel}>
                  <div className={styles.progressPanelHeader}>
                    <div>
                      <h3 className={styles.sectionTitle}>Import progress</h3>
                      <p className={styles.empty}>Follow the current pipeline status, runner activity, and review timeline.</p>
                    </div>
                  </div>

                  <div className={styles.statusPanel}>
                    {modeHint ? (
                      <div className={styles.statusHeader}>
                        <span className={styles.statusBadge}>{describePipeline(jobMode)}</span>
                        <p className={styles.statusHint}>{modeHint}</p>
                      </div>
                    ) : null}
                    {statusText && !showCodexLiveFeed ? <p className={styles.status}>{statusText}</p> : null}
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
                        {showCodexLiveFeed ? (
                          <div className={styles.codexFeedSection}>
                            <div className={styles.explainerCard}>
                              <div className={styles.explainerHeader}>
                                <div>
                                  <p className={styles.explainerTitle}>Runtime explainer</p>
                                  <p className={styles.explainerEyebrow}>Inferred runtime explanation</p>
                                </div>
                                <div className={styles.codexFeedMetaBlock}>
                                  <span className={styles.codexFeedPill}>
                                    {describeCodexAttempt(
                                      codexExplainer.attempt ??
                                        latestCodexEvent?.attempt ??
                                        latestRunnerObservation?.attempt ??
                                        'primary',
                                    )}
                                  </span>
                                  {codexFeedSilence ? (
                                    <span className={styles.codexFeedIdle}>{codexFeedSilence}</span>
                                  ) : null}
                                </div>
                              </div>
                              <div className={styles.explainerGrid}>
                                <div className={styles.explainerSection}>
                                  <span className={styles.explainerLabel}>Now</span>
                                  <p className={styles.explainerValue}>{codexExplainer.headline}</p>
                                </div>
                                <div className={styles.explainerSection}>
                                  <span className={styles.explainerLabel}>Why not done</span>
                                  <p className={styles.explainerValue}>{codexExplainer.reason}</p>
                                </div>
                                <div className={styles.explainerSection}>
                                  <span className={styles.explainerLabel}>Based on</span>
                                  <ul className={styles.explainerEvidenceList}>
                                    {codexExplainer.evidence.map((item) => (
                                      <li key={item} className={styles.explainerEvidenceItem}>
                                        {item}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </div>
                            <div className={styles.codexFeedHeader}>
                              <div>
                                <p className={styles.codexFeedTitle}>Codex live feed</p>
                                <p className={styles.codexFeedLead}>{codexFeedHeadline}</p>
                              </div>
                              <div className={styles.codexFeedMetaBlock}>
                                <span className={styles.codexFeedPill}>
                                  {describeCodexAttempt(
                                    latestCodexEvent?.attempt ??
                                      latestRunnerObservation?.attempt ??
                                      'primary',
                                  )}
                                </span>
                                {codexFeedSilence ? (
                                  <span className={styles.codexFeedIdle}>{codexFeedSilence}</span>
                                ) : null}
                              </div>
                            </div>
                            {codexFeedItems.length > 0 ? (
                              <ol className={styles.codexFeedList}>
                                {codexFeedItems.map((event, index) => (
                                  <li
                                    key={`${event.attempt}_${event.at}_${event.eventType}_${index}`}
                                    className={styles.codexFeedItem}
                                  >
                                    <div className={styles.codexFeedItemHeader}>
                                      <span className={styles.codexFeedAttempt}>
                                        {describeCodexAttempt(event.attempt)}
                                      </span>
                                      <span className={styles.codexFeedType}>{event.eventType}</span>
                                    </div>
                                    <p className={styles.codexFeedSummary}>{event.summary}</p>
                                    <details className={styles.codexFeedRaw}>
                                      <summary>查看原始 JSON</summary>
                                      <pre>{event.rawJson}</pre>
                                    </details>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className={styles.codexFeedEmpty}>
                                真实 CLI 事件会在这里持续追加。
                              </p>
                            )}
                            {showDiagnosticsPanel ? (
                              <details className={styles.diagnosticsPanel}>
                                <summary className={styles.diagnosticsSummary}>
                                  Import diagnostics
                                </summary>
                                <div className={styles.diagnosticsBody}>
                                  <p className={styles.statusMeta}>Runner status: {runnerStatus}</p>
                                  {groupedCodexDiagnostics.actionable.length > 0 ? (
                                    <div className={styles.diagnosticGroup} data-category="actionable">
                                      <p className={styles.diagnosticGroupTitle}>
                                        {describeDiagnosticCategory('actionable')}
                                      </p>
                                      <ol className={styles.diagnosticList}>
                                        {groupedCodexDiagnostics.actionable
                                          .slice()
                                          .reverse()
                                          .map((diagnostic, index) => (
                                            <li
                                              key={`${diagnostic.category}_${diagnostic.at}_${index}`}
                                              className={styles.diagnosticItem}
                                            >
                                              <p className={styles.diagnosticMessage}>{diagnostic.message}</p>
                                              <details className={styles.codexFeedRaw}>
                                                <summary>View raw stderr</summary>
                                                <pre>{diagnostic.rawLine}</pre>
                                              </details>
                                            </li>
                                          ))}
                                      </ol>
                                    </div>
                                  ) : null}
                                  {groupedCodexDiagnostics.capability_gap.length > 0 ? (
                                    <div className={styles.diagnosticGroup}>
                                      <p className={styles.diagnosticGroupTitle}>
                                        {describeDiagnosticCategory('capability_gap')}
                                      </p>
                                      <ol className={styles.diagnosticList}>
                                        {groupedCodexDiagnostics.capability_gap
                                          .slice()
                                          .reverse()
                                          .map((diagnostic, index) => (
                                            <li
                                              key={`${diagnostic.category}_${diagnostic.at}_${index}`}
                                              className={styles.diagnosticItem}
                                            >
                                              <p className={styles.diagnosticMessage}>{diagnostic.message}</p>
                                              <details className={styles.codexFeedRaw}>
                                                <summary>View raw stderr</summary>
                                                <pre>{diagnostic.rawLine}</pre>
                                              </details>
                                            </li>
                                          ))}
                                      </ol>
                                    </div>
                                  ) : null}
                                  {groupedCodexDiagnostics.noise.length > 0 ? (
                                    <details className={styles.diagnosticGroup}>
                                      <summary className={styles.diagnosticsSummary}>
                                        {describeDiagnosticCategory('noise')}
                                      </summary>
                                      <ol className={styles.diagnosticList}>
                                        {groupedCodexDiagnostics.noise
                                          .slice()
                                          .reverse()
                                          .map((diagnostic, index) => (
                                            <li
                                              key={`${diagnostic.category}_${diagnostic.at}_${index}`}
                                              className={styles.diagnosticItem}
                                            >
                                              <p className={styles.diagnosticMessage}>{diagnostic.message}</p>
                                              <details className={styles.codexFeedRaw}>
                                                <summary>View raw stderr</summary>
                                                <pre>{diagnostic.rawLine}</pre>
                                              </details>
                                            </li>
                                          ))}
                                      </ol>
                                    </details>
                                  ) : null}
                                  <ol className={styles.timelineList}>
                                    {statusTimeline.map((entry) => (
                                      <li
                                        key={entry.id}
                                        className={styles.timelineItem}
                                        data-active={entry.completedAt === null}
                                      >
                                        <div className={styles.timelineHeader}>
                                          <strong>{describeStage(entry.stage)}</strong>
                                          <span className={styles.timelineDuration}>
                                            {describeTimelineDuration(entry, nowMs)}
                                          </span>
                                        </div>
                                        <p className={styles.timelineMessage}>{entry.message}</p>
                                        {entry.runnerObservations.length > 0 ? (
                                          <div className={styles.timelineObservations}>
                                            {entry.runnerObservations.map((observation, index) => (
                                              <p
                                                key={`${entry.id}_${observation.phase}_${index}`}
                                                className={styles.timelineObservation}
                                              >
                                                {observation.attempt === 'repair' ? 'Repair' : 'Primary'}: {describeRunnerPhase(observation)}
                                              </p>
                                            ))}
                                          </div>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {preview?.summary ? <p className={styles.summaryText}>{preview.summary}</p> : null}
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
              <h3 className={styles.sectionTitle}>Structured preview</h3>
              {showStructuredGeneratingState ? (
                <EmptyState
                  title="Generating structured preview"
                  description="The import structure is still being generated. Keep this step open or switch back later to review the result."
                />
              ) : showStructuredEmptyState ? (
                <EmptyState
                  title="No structured preview yet"
                  description="Generate an import preview from Step 1 to see the imported hierarchy here."
                />
              ) : (
                <PreviewTree nodes={previewTree} />
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
                    description="Merge suggestions and conflicts will appear here once the preview finishes generating."
                  />
                ) : showMergeIdleState ? (
                  <EmptyState
                    title="No merge review content yet"
                    description="Generate an import preview from Step 1 to review merge suggestions and conflicts here."
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
              <Button tone="primary" iconEnd="chevronRight" onClick={handleNext}>
                Next
              </Button>
            ) : null}
            {currentStep === 'merge' ? (
              <Button
                tone="primary"
                iconStart="document"
                onClick={onApply}
                disabled={!preview || isPreviewing || isApplying}
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
