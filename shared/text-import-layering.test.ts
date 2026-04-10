import { describe, expect, it } from 'vitest'
import type { KnowledgeSemanticEdge, KnowledgeSemanticNode, KnowledgeSource } from './ai-contract.js'
import {
  buildKnowledgeNodeNote,
  compileSemanticLayerViews,
  deriveSemanticGraphFromPreviewNodes,
} from './text-import-layering.js'

function createSource(title: string): KnowledgeSource {
  return {
    id: 'source_1',
    type: 'paste',
    title,
    raw_content: '',
    metadata: {},
  }
}

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
          output: null,
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

  it('keeps same-titled child nodes separate across different semantic branches', () => {
    const semanticNodes: KnowledgeSemanticNode[] = [
      {
        id: 'root',
        type: 'question',
        title: 'Who should we target first?',
        summary: 'Who should we target first?',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'pain',
        type: 'project',
        title: 'Most painful segment',
        summary: 'Most painful segment',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'access',
        type: 'project',
        title: 'Easiest channel',
        summary: 'Easiest channel',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'pain_criteria',
        type: 'criterion',
        title: 'Criteria',
        summary: 'Criteria',
        detail: 'Look for repeated pain during interviews.',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'access_criteria',
        type: 'criterion',
        title: 'Criteria',
        summary: 'Criteria',
        detail: 'Look for channels with immediate reach.',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
    ]
    const semanticEdges: KnowledgeSemanticEdge[] = [
      {
        from: 'pain',
        to: 'root',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      {
        from: 'access',
        to: 'root',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      {
        from: 'pain_criteria',
        to: 'pain',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      {
        from: 'access_criteria',
        to: 'access',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
    ]

    const compiled = compileSemanticLayerViews({
      bundleId: 'bundle_gtm',
      bundleTitle: 'Import: GTM',
      sources: [],
      semanticNodes,
      semanticEdges,
      fallbackInsertionParentTopicId: 'topic_root',
    })
    const projection = compiled.viewProjections[compiled.activeViewId]
    const criteriaNodes = projection.previewNodes.filter((node) => node.title === 'Criteria')

    expect(criteriaNodes).toHaveLength(2)
    expect(criteriaNodes.map((node) => node.id).sort()).toEqual(['access_criteria', 'pain_criteria'])
    expect(criteriaNodes.map((node) => node.parentId).sort()).toEqual(['access', 'pain'])
    expect(criteriaNodes.map((node) => node.note)).toEqual([
      'Look for channels with immediate reach.',
      'Look for repeated pain during interviews.',
    ])
  })

  it('keeps wrapper headings out of the visible thinking spine and selects a semantic root', () => {
    const semanticNodes: KnowledgeSemanticNode[] = [
      {
        id: 'import_root',
        type: 'section',
        title: 'Markdown 记录',
        summary: 'Markdown 记录',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'turn_user',
        type: 'section',
        title: 'Turn 1 · User',
        summary: 'Turn 1 · User',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'turn_assistant',
        type: 'section',
        title: 'Turn 1 · Assistant',
        summary: 'Turn 1 · Assistant',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'question_root',
        type: 'question',
        title: 'Should we target SMB first?',
        summary: 'Should we target SMB first?',
        detail: 'Choose the first segment with the strongest demand signal.',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'answer',
        type: 'claim',
        title: 'Target SMB first',
        summary: 'Target SMB first',
        detail: 'SMB shows repeated urgency and faster access.',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
    ]
    const semanticEdges: KnowledgeSemanticEdge[] = [
      {
        from: 'turn_user',
        to: 'import_root',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      {
        from: 'turn_assistant',
        to: 'import_root',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      {
        from: 'question_root',
        to: 'turn_user',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      {
        from: 'answer',
        to: 'question_root',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
    ]

    const compiled = compileSemanticLayerViews({
      bundleId: 'bundle_wrapper',
      bundleTitle: 'Markdown 记录',
      sources: [createSource('Markdown 记录')],
      semanticNodes,
      semanticEdges,
      fallbackInsertionParentTopicId: 'topic_root',
      documentType: 'analysis',
    })
    const projection = compiled.viewProjections[compiled.activeViewId]

    expect(projection.previewNodes[0]).toMatchObject({
      id: 'question_root',
      title: 'Should we target SMB first?',
    })
    expect(projection.previewNodes.map((node) => node.title)).not.toContain('Markdown 记录')
    expect(projection.previewNodes.map((node) => node.title)).not.toContain('Turn 1 · User')
    expect(projection.previewNodes.map((node) => node.title)).not.toContain('Turn 1 · Assistant')
  })

  it('keeps breadth-first analysis branches visible and limits each section to representative children', () => {
    const semanticNodes: KnowledgeSemanticNode[] = [
      {
        id: 'import_root',
        type: 'section',
        title: 'Q2 activation analysis',
        summary: 'Q2 activation analysis',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'thesis',
        type: 'claim',
        title: 'Activation stalls after signup',
        summary: 'Activation stalls after signup',
        detail: 'Users do not reach their first meaningful value quickly enough.',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      ...['Demand signal', 'Setup friction', 'Time-to-value', 'Retention risk', 'Pricing pressure'].map(
        (title, index) =>
          ({
            id: `section_${index + 1}`,
            type: 'section',
            title,
            summary: title,
            detail: `${title} detail`,
            source_refs: [],
            confidence: 'high',
            task: null,
          }) satisfies KnowledgeSemanticNode,
      ),
      {
        id: 'section_1_claim',
        type: 'claim',
        title: 'Activation fails before the aha moment',
        summary: 'Activation fails before the aha moment',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
      {
        id: 'section_1_metric',
        type: 'metric',
        title: 'Median setup takes 18 minutes',
        summary: 'Median setup takes 18 minutes',
        detail: '',
        source_refs: [],
        confidence: 'medium',
        task: null,
      },
      {
        id: 'section_1_question',
        type: 'question',
        title: 'Which setup step creates the longest delay?',
        summary: 'Which setup step creates the longest delay?',
        detail: '',
        source_refs: [],
        confidence: 'medium',
        task: null,
      },
      {
        id: 'section_1_task',
        type: 'task',
        title: 'Ship setup audit',
        summary: 'Ship setup audit',
        detail: 'Generate a setup-friction report.',
        source_refs: [],
        confidence: 'high',
        task: {
          status: 'todo',
          owner: null,
          due_date: null,
          priority: null,
          depends_on: [],
          output: 'Setup-friction report',
          source_refs: [],
          definition_of_done: null,
        },
      },
    ]
    const semanticEdges: KnowledgeSemanticEdge[] = [
      {
        from: 'thesis',
        to: 'import_root',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      ...[1, 2, 3, 4, 5].map(
        (index) =>
          ({
            from: `section_${index}`,
            to: 'thesis',
            type: 'belongs_to',
            label: null,
            source_refs: [],
            confidence: 'high',
          }) satisfies KnowledgeSemanticEdge,
      ),
      {
        from: 'section_1_claim',
        to: 'section_1',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
      {
        from: 'section_1_metric',
        to: 'section_1',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'medium',
      },
      {
        from: 'section_1_question',
        to: 'section_1',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'medium',
      },
      {
        from: 'section_1_task',
        to: 'section_1',
        type: 'belongs_to',
        label: null,
        source_refs: [],
        confidence: 'high',
      },
    ]

    const compiled = compileSemanticLayerViews({
      bundleId: 'bundle_analysis',
      bundleTitle: 'Q2 activation analysis',
      sources: [createSource('Q2 activation analysis')],
      semanticNodes,
      semanticEdges,
      fallbackInsertionParentTopicId: 'topic_root',
      documentType: 'analysis',
    })
    const projection = compiled.viewProjections[compiled.activeViewId]

    expect(projection.previewNodes[0]).toMatchObject({
      id: 'thesis',
      title: 'Activation stalls after signup',
    })

    const firstOrderSections = projection.previewNodes
      .filter((node) => node.parentId === 'thesis')
      .map((node) => node.title)
    expect(firstOrderSections).toEqual([
      'Demand signal',
      'Setup friction',
      'Time-to-value',
      'Retention risk',
      'Pricing pressure',
    ])

    const sectionOneChildren = projection.previewNodes
      .filter((node) => node.parentId === 'section_1')
      .map((node) => node.title)
    expect(sectionOneChildren).toEqual([
      'Activation fails before the aha moment',
      'Median setup takes 18 minutes',
      'Ship setup audit',
    ])
  })
})
