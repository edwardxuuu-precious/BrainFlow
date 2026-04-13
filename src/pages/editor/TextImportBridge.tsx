import { useMemo } from 'react'
import { TextImportDialog } from '../../features/import/components/TextImportDialog'
import {
  getLegacyGtmRepairAvailability,
  repairKnowledgeImportBundle,
} from '../../features/import/knowledge-import'
import { useTextImportStore } from '../../features/import/text-import-store'
import { useEditorStore } from '../../features/editor/editor-store'
import type { MindMapDocument } from '../../features/documents/types'
import type { ReactFlowInstance } from '@xyflow/react'
import type { MindMapFlowNode } from '../../features/editor/layout'

interface TextImportBridgeProps {
  document: MindMapDocument
  activeTopicId: string | null
  selectedTopicIds: string[]
  reactFlowRef: React.RefObject<ReactFlowInstance<MindMapFlowNode> | null>
}

export function TextImportBridge({
  document,
  activeTopicId,
  selectedTopicIds,
  reactFlowRef,
}: TextImportBridgeProps) {
  const store = useTextImportStore()

  const selectedTopic = activeTopicId ? document.topics[activeTopicId] ?? null : null
  const rootLabel = document.topics[document.rootTopicId]?.title ?? 'Document root'
  const currentSelectionLabel = selectedTopic?.title ?? null

  const activeBundle =
    document.workspace.activeImportBundleId
      ? document.knowledgeImports[document.workspace.activeImportBundleId] ?? null
      : null
  const repairAvailability = useMemo(
    () => getLegacyGtmRepairAvailability(activeBundle),
    [activeBundle],
  )

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) {
      return
    }

    await store.previewFiles(
      document,
      { activeTopicId, selectedTopicIds },
      files,
    )
  }

  const handleGeneratePreview = async () => {
    await store.previewText(document, {
      activeTopicId,
      selectedTopicIds,
    })
  }

  const handleChangePreset = async (
    preset: Parameters<typeof store.rerunPreviewWithPreset>[2],
  ) => {
    const shouldRerun = Boolean(
      store.sourceFiles.length > 0 || store.preview || store.isPreviewing,
    )

    if (!shouldRerun) {
      store.setPresetOverride(preset)
      return
    }

    await store.rerunPreviewWithPreset(document, {
      activeTopicId,
      selectedTopicIds,
    }, preset)
  }

  const handleChangeArchetype = async (
    archetype: Parameters<typeof store.rerunPreviewWithArchetype>[2],
  ) => {
    const shouldRerun = Boolean(
      store.sourceFiles.length > 0 || store.preview || store.isPreviewing,
    )

    if (!shouldRerun) {
      store.setArchetypeOverride(archetype)
      return
    }

    await store.rerunPreviewWithArchetype(document, {
      activeTopicId,
      selectedTopicIds,
    }, archetype)
  }

  const handleApply = async () => {
    const result = await store.applyPreview(document)
    if (!result) {
      return
    }

    useEditorStore
      .getState()
      .applyExternalDocument(result.document, result.selectedTopicId ?? activeTopicId)
    store.resetSession()
    store.close()
    await reactFlowRef.current?.fitView({ padding: 0.24, duration: 180 })
  }

  const handleRepair = async () => {
    if (!document.workspace.activeImportBundleId) {
      return
    }

    const result = repairKnowledgeImportBundle(document, document.workspace.activeImportBundleId)
    if (!result) {
      return
    }

    useEditorStore
      .getState()
      .applyExternalDocument(result.document, result.selectedTopicId ?? activeTopicId)
    store.resetSession()
    store.close()
    await reactFlowRef.current?.fitView({ padding: 0.24, duration: 180 })
  }

  return (
    <TextImportDialog
      open={store.isOpen}
      sourceName={store.sourceName}
      sourceType={store.sourceType}
      sourceFiles={store.sourceFiles}
      rawText={store.rawText}
      draftSourceName={store.draftSourceName}
      draftText={store.draftText}
      preprocessedHints={store.preprocessedHints}
      preview={store.preview}
      draftTree={store.draftTree}
      previewTree={store.previewTree}
      draftConfirmed={store.draftConfirmed}
      crossFileMergeSuggestions={store.crossFileMergeSuggestions}
      approvedConflictIds={store.approvedConflictIds}
      statusText={store.statusText}
      progress={store.progress}
      progressIndeterminate={store.progressIndeterminate}
      progressEntries={store.progressEntries}
      traceEntries={store.traceEntries}
      modeHint={store.modeHint}
      error={store.error}
      isPreviewing={store.isPreviewing}
      isApplying={store.isApplying}
      previewStartedAt={store.previewStartedAt}
      previewFinishedAt={store.previewFinishedAt}
      jobMode={store.activeJobMode}
      jobType={store.activeJobType}
      fileCount={store.fileCount}
      completedFileCount={store.completedFileCount}
      currentFileName={store.currentFileName}
      semanticMergeStage={store.semanticMergeStage}
      semanticCandidateCount={store.semanticCandidateCount}
      semanticAdjudicatedCount={store.semanticAdjudicatedCount}
      semanticFallbackCount={store.semanticFallbackCount}
      applyProgress={store.applyProgress}
      appliedCount={store.appliedCount}
      totalOperations={store.totalOperations}
      currentApplyLabel={store.currentApplyLabel}
      planningSummaries={store.planningSummaries}
      presetOverride={store.presetOverride}
      archetypeOverride={store.archetypeOverride}
      anchorMode={store.anchorMode}
      documentRootLabel={rootLabel}
      currentSelectionLabel={currentSelectionLabel}
      repairLabel="修复当前导入"
      repairDescription={
        repairAvailability.isLegacyGtmBundle
          ? repairAvailability.canRepair
            ? '检测到旧版 GTM 模板导入。将基于当前 bundle 保存的原始 sources 重新构建并替换画布结构。'
            : repairAvailability.reason
          : null
      }
      repairDisabled={!repairAvailability.canRepair}
      onClose={store.close}
      onChooseFiles={(files) => void handleFilesSelected(files)}
      onPresetChange={(value) => void handleChangePreset(value)}
      onArchetypeChange={(value) => void handleChangeArchetype(value)}
      onAnchorModeChange={store.setAnchorMode}
      onDraftSourceNameChange={store.setDraftSourceName}
      onDraftTextChange={store.setDraftText}
      onGenerateFromText={() => void handleGeneratePreview()}
      onToggleConflict={store.toggleConflictApproval}
      onConfirmDraft={store.confirmDraft}
      onRenamePreviewNode={store.renamePreviewNode}
      onPromotePreviewNode={store.promotePreviewNode}
      onDemotePreviewNode={store.demotePreviewNode}
      onDeletePreviewNode={store.deletePreviewNode}
      onApply={() => void handleApply()}
      onRepair={repairAvailability.isLegacyGtmBundle ? () => void handleRepair() : undefined}
    />
  )
}
