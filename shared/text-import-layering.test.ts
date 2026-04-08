import { describe, expect, it } from 'vitest'
import type { KnowledgeSemanticEdge, KnowledgeSemanticNode } from './ai-contract'
import {
  buildKnowledgeNodeNote,
  compileSemanticLayerViews,
  deriveSemanticGraphFromPreviewNodes,
} from './text-import-layering'

describe('text-import-layering', () => {
  it('normalizes node notes without repeating the title or duplicated detail paragraphs', () => {
    const note = buildKnowledgeNodeNote({
      title: 'First wave segment',
      summary: 'First wave segment',
      detail: 'First wave segment\n\nValidate the most painful segment.\n\nValidate the most painful segment.',
    })

    expect(note).toBe('Validate the most painful segment.')
  })

  it('keeps thinking-view notes stable across repeated semantic projection syncs', () => {
    const semanticNodes: KnowledgeSemanticNode[] = [
      {
        id: 'question_root',
        type: 'question',
        title: 'Who should we target first?',
        summary: 'Who should we target first?',
        detail:
          'Who should we target first?\n\nPick the segment with the strongest pain and fastest access.\n\nPick the segment with the strongest pain and fastest access.',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'task_validate',
        type: 'task',
        title: 'Validate the beachhead',
        summary: 'Validate the beachhead',
        detail:
          'Validate the beachhead\n\nRun five discovery calls this week.\n\nstatus: in_progress\npriority: high\ndefinition_of_done: We confirm repeated urgency in three calls.',
        source_refs: [],
        confidence: 'high',
        task: {
          status: 'in_progress',
          owner: null,
          due_date: null,
          priority: 'high',
          depends_on: [],
          source_refs: [],
          definition_of_done: 'We confirm repeated urgency in three calls.',
        },
      },
    ]
    const semanticEdges: KnowledgeSemanticEdge[] = [
      {
        from: 'task_validate',
        to: 'question_root',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
    ]

    const firstCompiled = compileSemanticLayerViews({
      bundleId: 'bundle_gtm',
      bundleTitle: 'Import: GTM',
      sources: [],
      semanticNodes,
      semanticEdges,
      fallbackInsertionParentTopicId: 'topic_root',
    })
    const firstProjection = firstCompiled.viewProjections[firstCompiled.activeViewId]
    const firstNotes = Object.fromEntries(
      firstProjection.previewNodes.map((node) => [node.id, node.note ?? '']),
    )

    expect(firstNotes.question_root).toBe('Pick the segment with the strongest pain and fastest access.')
    expect(firstNotes.task_validate).toBe(
      [
        'Run five discovery calls this week.',
        'status: in_progress\npriority: high\ndefinition_of_done: We confirm repeated urgency in three calls.',
      ].join('\n\n'),
    )

    const roundTripGraph = deriveSemanticGraphFromPreviewNodes({
      previewNodes: firstProjection.previewNodes,
      existingNodes: semanticNodes,
      existingEdges: semanticEdges,
    })
    const secondCompiled = compileSemanticLayerViews({
      bundleId: 'bundle_gtm',
      bundleTitle: 'Import: GTM',
      sources: [],
      semanticNodes: roundTripGraph.semanticNodes,
      semanticEdges: roundTripGraph.semanticEdges,
      fallbackInsertionParentTopicId: 'topic_root',
    })
    const secondProjection = secondCompiled.viewProjections[secondCompiled.activeViewId]
    const secondNotes = Object.fromEntries(
      secondProjection.previewNodes.map((node) => [node.id, node.note ?? '']),
    )

    expect(secondNotes).toEqual(firstNotes)
    expect(secondNotes.question_root.match(/Who should we target first\?/g) ?? []).toHaveLength(0)
    expect(secondNotes.task_validate.match(/status: in_progress/g) ?? []).toHaveLength(1)
    expect(secondNotes.task_validate.match(/priority: high/g) ?? []).toHaveLength(1)
    expect(secondNotes.task_validate.match(/definition_of_done:/g) ?? []).toHaveLength(1)
  })
})
