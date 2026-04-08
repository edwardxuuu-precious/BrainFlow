import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildAiContext } from '../src/features/ai/ai-context'
import { createMindMapDocument } from '../src/features/documents/document-factory'
import type { MindMapDocument } from '../src/features/documents/types'
import { applyTextImportPreview } from '../src/features/import/text-import-apply'
import {
  createLocalTextImportBatchPreview,
  createLocalTextImportPreview,
  sortTextImportBatchSources,
  type LocalTextImportBatchRequest,
  type LocalTextImportSourceInput,
} from '../src/features/import/local-text-import-core'
import { preprocessTextToImportHints } from '../src/features/import/text-import-preprocess'
import { resolveTextImportPlanningOptions } from '../shared/text-import-semantics'

interface SingleRunResult {
  sourceName: string
  preprocessMs: number
  planningMs: number
  parseTreeMs: number
  batchComposeMs: number
  candidateGenMs: number
  semanticMergeMs: number
  buildPreviewMs: number
  applyPlanMs: number
  totalReadyMs: number
  headingCount: number
  listItemCount: number
  tableCount: number
  codeBlockCount: number
  preprocessHintCount: number
  totalNodeCount: number
  edgeCount: number
  mergeSuggestionCount: number
  conflictCount: number
  highConfidenceMergeCount: number
  mediumConfidenceSuggestionCount: number
  fallbackCount: number
  adjudicationRequestCount: number
  adjudicationRepresentativeCount: number
  warningCount: number
}

interface BatchRunResult {
  preprocessMs: number
  planningMs: number
  parseTreeMs: number
  batchComposeMs: number
  candidateGenMs: number
  semanticMergeMs: number
  buildPreviewMs: number
  applyPlanMs: number
  totalReadyMs: number
  fileCount: number
  totalNodeCount: number
  edgeCount: number
  mergeSuggestionCount: number
  crossFileSuggestionCount: number
  highConfidenceMergeCount: number
  mediumConfidenceSuggestionCount: number
  fallbackCount: number
  adjudicationRequestCount: number
  adjudicationRepresentativeCount: number
  warningCount: number
}

function parseArgs(argv: string[]) {
  const options: Record<string, string> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      continue
    }

    const key = value.slice(2)
    const nextValue = argv[index + 1]
    if (!nextValue || nextValue.startsWith('--')) {
      options[key] = 'true'
      continue
    }

    options[key] = nextValue
    index += 1
  }

  return options
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

async function loadDocumentSnapshot(snapshotPath: string | undefined): Promise<MindMapDocument> {
  if (!snapshotPath) {
    return createMindMapDocument('Benchmark Document')
  }

  const raw = await readFile(snapshotPath, 'utf8')
  return JSON.parse(raw) as MindMapDocument
}

function createSelectionContext(document: MindMapDocument) {
  return buildAiContext(document, [document.rootTopicId], document.rootTopicId)
}

async function buildSourceInput(filePath: string): Promise<LocalTextImportSourceInput> {
  const rawText = await readFile(filePath, 'utf8')
  const preprocessedHints = preprocessTextToImportHints(rawText)
  const planning = resolveTextImportPlanningOptions({
    sourceName: path.basename(filePath),
    sourceType: 'file',
    preprocessedHints,
  })
  return {
    sourceName: path.basename(filePath),
    sourceType: 'file',
    rawText,
    preprocessedHints,
    semanticHints: planning.semanticHints,
    intent: planning.intent,
    archetype: planning.resolvedArchetype,
    archetypeMode: 'auto',
    contentProfile: planning.contentProfile,
    nodeBudget: planning.nodeBudget,
    preparedArtifacts: planning.preparedArtifacts,
  }
}

async function runSingleDeterministicBenchmark(
  filePath: string,
  snapshotPath: string | undefined,
  runs: number,
) {
  const document = await loadDocumentSnapshot(snapshotPath)
  const requestContext = createSelectionContext(document)
  const source = await buildSourceInput(filePath)
  const results: SingleRunResult[] = []

  for (let run = 0; run < runs; run += 1) {
    const preprocessStartedAt = Date.now()
    const preprocessedHints = preprocessTextToImportHints(source.rawText)
    const preprocessMs = Date.now() - preprocessStartedAt
    const planningStartedAt = Date.now()
    const planning = resolveTextImportPlanningOptions({
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      preprocessedHints,
    })
    const planningMs = Date.now() - planningStartedAt

    const previewStartedAt = Date.now()
    const built = createLocalTextImportPreview(
      {
        documentId: document.id,
        documentTitle: document.title,
        baseDocumentUpdatedAt: document.updatedAt,
        context: requestContext,
        anchorTopicId: document.rootTopicId,
        sourceName: source.sourceName,
        sourceType: source.sourceType,
        rawText: source.rawText,
        intent: planning.intent,
        archetype: planning.resolvedArchetype,
        archetypeMode: 'auto',
        contentProfile: planning.contentProfile,
        nodeBudget: planning.nodeBudget,
        preprocessedHints,
        semanticHints: planning.semanticHints,
      },
      {
        preprocessHintCount: preprocessedHints.length,
        preparedArtifacts: planning.preparedArtifacts,
      },
    )

    const applyStartedAt = Date.now()
    applyTextImportPreview(structuredClone(document), built.response, [])
    const applyPlanMs = Date.now() - applyStartedAt
    const totalReadyMs = Date.now() - previewStartedAt + preprocessMs

    results.push({
      sourceName: source.sourceName,
      preprocessMs,
      planningMs,
      parseTreeMs: built.metrics.parseTreeMs,
      batchComposeMs: built.metrics.batchComposeMs,
      candidateGenMs: built.metrics.candidateGenMs,
      semanticMergeMs: built.metrics.semanticMergeMs,
      buildPreviewMs: built.metrics.buildPreviewMs,
      applyPlanMs,
      totalReadyMs,
      headingCount: built.metrics.headingCount,
      listItemCount: built.metrics.listItemCount,
      tableCount: built.metrics.tableCount,
      codeBlockCount: built.metrics.codeBlockCount,
      preprocessHintCount: built.metrics.preprocessHintCount,
      totalNodeCount: built.metrics.totalNodeCount,
      edgeCount: built.metrics.edgeCount,
      mergeSuggestionCount: built.metrics.mergeSuggestionCount,
      conflictCount: built.response.conflicts.length,
      highConfidenceMergeCount:
        (built.response.semanticMerge?.autoMergedExistingCount ?? 0) +
        (built.response.semanticMerge?.autoMergedCrossFileCount ?? 0),
      mediumConfidenceSuggestionCount:
        (built.response.mergeSuggestions?.filter((item) => item.confidence === 'medium').length ?? 0) +
        (built.response.crossFileMergeSuggestions?.filter((item) => item.confidence === 'medium').length ?? 0),
      fallbackCount: built.response.semanticMerge?.fallbackCount ?? 0,
      adjudicationRequestCount: built.response.diagnostics?.semanticAdjudication.requestCount ?? 0,
      adjudicationRepresentativeCount:
        built.response.diagnostics?.semanticAdjudication.representativeCount ?? 0,
      warningCount: built.metrics.warningCount,
    })
  }

  return {
    sourceName: source.sourceName,
    filePath,
    results,
    summary: {
      p50Ms: percentile(results.map((item) => item.totalReadyMs), 0.5),
      p95Ms: percentile(results.map((item) => item.totalReadyMs), 0.95),
    },
  }
}

async function listCorpusFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name))
    .map((entry) => path.join(directoryPath, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

async function runBatchDeterministicBenchmark(
  directoryPath: string,
  snapshotPath: string | undefined,
  runs: number,
) {
  const document = await loadDocumentSnapshot(snapshotPath)
  const files = sortTextImportBatchSources(
    await Promise.all((await listCorpusFiles(directoryPath)).map((filePath) => buildSourceInput(filePath))),
  )
  const requestContext = createSelectionContext(document)
  const results: BatchRunResult[] = []

  for (let run = 0; run < runs; run += 1) {
    let preprocessMs = 0
    let planningMs = 0
    const sources = files.map((file) => {
      const preprocessStartedAt = Date.now()
      const preprocessedHints = preprocessTextToImportHints(file.rawText)
      preprocessMs += Date.now() - preprocessStartedAt
      const planningStartedAt = Date.now()
      const planning = resolveTextImportPlanningOptions({
        sourceName: file.sourceName,
        sourceType: file.sourceType,
        preprocessedHints,
      })
      planningMs += Date.now() - planningStartedAt
      return {
        ...file,
        preprocessedHints,
        semanticHints: planning.semanticHints,
        intent: planning.intent,
        archetype: planning.resolvedArchetype,
        archetypeMode: 'auto' as const,
        contentProfile: planning.contentProfile,
        nodeBudget: planning.nodeBudget,
        preparedArtifacts: planning.preparedArtifacts,
      }
    })

    const batchRequest: LocalTextImportBatchRequest = {
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: requestContext,
      anchorTopicId: document.rootTopicId,
      batchTitle: 'Import batch: GTM',
      files: sources,
    }

    const previewStartedAt = Date.now()
    const built = createLocalTextImportBatchPreview(batchRequest)
    const applyStartedAt = Date.now()
    applyTextImportPreview(structuredClone(document), built.response, [])
    const applyPlanMs = Date.now() - applyStartedAt
    const totalReadyMs = Date.now() - previewStartedAt + preprocessMs

    results.push({
      preprocessMs,
      planningMs,
      parseTreeMs: built.metrics.parseTreeMs,
      batchComposeMs: built.metrics.batchComposeMs,
      candidateGenMs: built.metrics.candidateGenMs,
      semanticMergeMs: built.metrics.semanticMergeMs,
      buildPreviewMs: built.metrics.buildPreviewMs,
      applyPlanMs,
      totalReadyMs,
      fileCount: built.metrics.fileCount,
      totalNodeCount: built.metrics.totalNodeCount,
      edgeCount: built.metrics.edgeCount,
      mergeSuggestionCount: built.metrics.mergeSuggestionCount,
      crossFileSuggestionCount: built.metrics.crossFileSuggestionCount,
      highConfidenceMergeCount:
        (built.response.semanticMerge?.autoMergedExistingCount ?? 0) +
        (built.response.semanticMerge?.autoMergedCrossFileCount ?? 0),
      mediumConfidenceSuggestionCount:
        (built.response.mergeSuggestions?.filter((item) => item.confidence === 'medium').length ?? 0) +
        (built.response.crossFileMergeSuggestions?.filter((item) => item.confidence === 'medium').length ?? 0),
      fallbackCount: built.response.semanticMerge?.fallbackCount ?? 0,
      adjudicationRequestCount: built.response.diagnostics?.semanticAdjudication.requestCount ?? 0,
      adjudicationRepresentativeCount:
        built.response.diagnostics?.semanticAdjudication.representativeCount ?? 0,
      warningCount: built.metrics.warningCount,
    })
  }

  return {
    directoryPath,
    files: files.map((file) => file.sourceName),
    results,
    summary: {
      p50Ms: percentile(results.map((item) => item.totalReadyMs), 0.5),
      p95Ms: percentile(results.map((item) => item.totalReadyMs), 0.95),
    },
  }
}

async function runCodexComparisonBenchmark(
  filePath: string,
  snapshotPath: string | undefined,
  endpoint: string,
  runs: number,
) {
  const document = await loadDocumentSnapshot(snapshotPath)
  const source = await buildSourceInput(filePath)
  const requestBody = {
    documentId: document.id,
    documentTitle: document.title,
    baseDocumentUpdatedAt: document.updatedAt,
    context: createSelectionContext(document),
    anchorTopicId: document.rootTopicId,
    sourceName: source.sourceName,
    sourceType: source.sourceType,
    rawText: source.rawText,
    preprocessedHints: source.preprocessedHints,
  }

  const results: Array<{
    totalReadyMs: number
    statusStages: string[]
    previewNodeCount: number
    operationCount: number
    conflictCount: number
  }> = []

  for (let run = 0; run < runs; run += 1) {
    const startedAt = Date.now()
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Codex comparison request failed with status ${response.status}.`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const statusStages: string[] = []
    let finalResult: {
      previewNodes?: unknown[]
      operations?: unknown[]
      conflicts?: unknown[]
    } | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
        const event = JSON.parse(line) as
          | { type: 'status'; stage: string }
          | { type: 'result'; data: { previewNodes?: unknown[]; operations?: unknown[]; conflicts?: unknown[] } }
        if (event.type === 'status') {
          statusStages.push(event.stage)
        }
        if (event.type === 'result') {
          finalResult = event.data
        }
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer) as
        | { type: 'status'; stage: string }
        | { type: 'result'; data: { previewNodes?: unknown[]; operations?: unknown[]; conflicts?: unknown[] } }
      if (event.type === 'status') {
        statusStages.push(event.stage)
      }
      if (event.type === 'result') {
        finalResult = event.data
      }
    }

    results.push({
      totalReadyMs: Date.now() - startedAt,
      statusStages,
      previewNodeCount: finalResult?.previewNodes?.length ?? 0,
      operationCount: finalResult?.operations?.length ?? 0,
      conflictCount: finalResult?.conflicts?.length ?? 0,
    })
  }

  return {
    filePath,
    endpoint,
    summary: {
      p50Ms: percentile(results.map((item) => item.totalReadyMs), 0.5),
      p95Ms: percentile(results.map((item) => item.totalReadyMs), 0.95),
    },
    results,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const runs = Number.parseInt(args.runs ?? '5', 10)
  const normalizedRuns = Number.isFinite(runs) ? runs : 5

  if (args.file) {
    const single = await runSingleDeterministicBenchmark(args.file, args.snapshot, normalizedRuns)
    console.log('Single-file benchmark summary')
    console.table([{ file: single.sourceName, ...single.summary }])
    console.log('Per-run metrics')
    console.table(single.results)

    if (args['compare-codex'] === 'true') {
      const codex = await runCodexComparisonBenchmark(
        args.file,
        args.snapshot,
        args.endpoint ?? 'http://127.0.0.1:8787/api/codex/import/preview',
        normalizedRuns,
      )
      console.log('Codex comparison summary')
      console.table([codex.summary])
      console.log('Codex comparison runs')
      console.table(codex.results)
    }

    console.log('JSON')
    console.log(JSON.stringify(single, null, 2))
    return
  }

  if (args.dir) {
    const filePaths = await listCorpusFiles(args.dir)
    const singleResults = []
    for (const filePath of filePaths) {
      singleResults.push(await runSingleDeterministicBenchmark(filePath, args.snapshot, normalizedRuns))
    }
    const batch = await runBatchDeterministicBenchmark(args.dir, args.snapshot, normalizedRuns)

    console.log('Single-file corpus summary')
    console.table(
      singleResults.map((item) => ({
        file: item.sourceName,
        p50Ms: item.summary.p50Ms,
        p95Ms: item.summary.p95Ms,
      })),
    )
    console.log('Batch benchmark summary')
    console.table([{ files: batch.files.length, ...batch.summary }])
    console.log('Batch per-run metrics')
    console.table(batch.results)
    console.log('JSON')
    console.log(JSON.stringify({ singleResults, batch }, null, 2))
    return
  }

  throw new Error('Missing required --file or --dir argument.')
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
