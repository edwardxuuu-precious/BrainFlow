import { describe, expect, it } from 'vitest'
import type { TextImportNodePlan } from './ai-contract.js'
import { compileTextImportNodePlans, resolveTextImportPlanningOptions } from './text-import-semantics.js'

describe('compileTextImportNodePlans', () => {
  it('keeps semantic review hints on preview nodes while emitting title-and-note-only create_child operations', () => {
    const nodePlans: TextImportNodePlan[] = [
      {
        id: 'plan_action',
        parentId: null,
        order: 0,
        title: 'Follow up with design',
        note: null,
        semanticRole: 'action',
        confidence: 'high',
        sourceAnchors: [],
      },
      {
        id: 'plan_risk',
        parentId: null,
        order: 1,
        title: 'Budget risk',
        note: null,
        semanticRole: 'risk',
        confidence: 'medium',
        sourceAnchors: [],
      },
      {
        id: 'plan_timeline',
        parentId: null,
        order: 2,
        title: 'Launch window',
        note: null,
        semanticRole: 'timeline',
        confidence: 'medium',
        sourceAnchors: [],
      },
    ]

    const { previewNodes, operations } = compileTextImportNodePlans({
      insertionParentTopicId: 'root',
      nodePlans,
    })

    expect(previewNodes).toEqual([
      expect.objectContaining({
        id: 'plan_action',
        semanticRole: 'action',
        confidence: 'high',
      }),
      expect.objectContaining({
        id: 'plan_risk',
        semanticRole: 'risk',
        confidence: 'medium',
      }),
      expect.objectContaining({
        id: 'plan_timeline',
        semanticRole: 'timeline',
        confidence: 'medium',
      }),
    ])
    expect(operations).toHaveLength(3)
    operations.forEach((operation: (typeof operations)[number]) => {
      expect(operation).toMatchObject({
        type: 'create_child',
      })
      expect('metadata' in operation ? operation.metadata : undefined).toBeUndefined()
      expect(operation).not.toHaveProperty('style')
      expect(operation).not.toHaveProperty('presentation')
    })
  })
})

describe('resolveTextImportPlanningOptions', () => {
  it('selects action_first for action-heavy notes', () => {
    const planning = resolveTextImportPlanningOptions({
      sourceName: 'team_meeting.md',
      sourceType: 'paste',
      preprocessedHints: [
        {
          id: 'hint_1',
          kind: 'task_list',
          text: 'Assign owner\nConfirm blockers',
          raw: '- [ ] Assign owner\n- [ ] Confirm blockers',
          level: 0,
          lineStart: 1,
          lineEnd: 2,
          sourcePath: ['Meeting'],
          items: ['Assign owner', 'Confirm blockers'],
          checked: [false, false],
          language: null,
          rows: undefined,
        },
        {
          id: 'hint_2',
          kind: 'paragraph',
          text: 'Decision: launch on Tuesday. Risk: support load may spike.',
          raw: 'Decision: launch on Tuesday. Risk: support load may spike.',
          level: 0,
          lineStart: 3,
          lineEnd: 3,
          sourcePath: ['Meeting'],
          language: null,
          rows: undefined,
        },
      ],
    })

    expect(planning.resolvedPreset).toBe('action_first')
    expect(planning.summary.confidence).not.toBe('low')
  })

  it('selects preserve for strongly structured runbooks', () => {
    const planning = resolveTextImportPlanningOptions({
      sourceName: 'launch_runbook.md',
      sourceType: 'paste',
      preprocessedHints: [
        {
          id: 'hint_1',
          kind: 'heading',
          text: 'Launch runbook',
          raw: '# Launch runbook',
          level: 1,
          lineStart: 1,
          lineEnd: 1,
          sourcePath: ['Launch runbook'],
          language: null,
          rows: undefined,
        },
        {
          id: 'hint_2',
          kind: 'ordered_list',
          text: 'Warm the audience\nShip the sequence',
          raw: '1. Warm the audience\n2. Ship the sequence',
          level: 0,
          lineStart: 2,
          lineEnd: 3,
          sourcePath: ['Launch runbook'],
          items: ['Warm the audience', 'Ship the sequence'],
          checked: undefined,
          language: null,
          rows: undefined,
        },
      ],
    })

    expect(planning.resolvedPreset).toBe('preserve')
    expect(planning.resolvedArchetype).toBe('method')
    expect(planning.summary.recommendedRoute).toBe('local_markdown')
    expect(planning.summary.structureScore).toBeGreaterThan(0.5)
  })

  it('falls back to distill for mixed prose', () => {
    const planning = resolveTextImportPlanningOptions({
      sourceName: 'brain_dump.md',
      sourceType: 'paste',
      preprocessedHints: [
        {
          id: 'hint_1',
          kind: 'paragraph',
          text: 'We discussed several launch concerns and supporting evidence, but the next steps are still fuzzy.',
          raw: 'We discussed several launch concerns and supporting evidence, but the next steps are still fuzzy.',
          level: 0,
          lineStart: 1,
          lineEnd: 1,
          sourcePath: ['Brain dump'],
          language: null,
          rows: undefined,
        },
        {
          id: 'hint_2',
          kind: 'paragraph',
          text: 'There are a few comparisons, some metrics, and some open questions mixed together.',
          raw: 'There are a few comparisons, some metrics, and some open questions mixed together.',
          level: 0,
          lineStart: 2,
          lineEnd: 2,
          sourcePath: ['Brain dump'],
          language: null,
          rows: undefined,
        },
      ],
    })

    expect(planning.resolvedPreset).toBe('distill')
  })

  it('marks close preset scores as low confidence while still choosing one', () => {
    const planning = resolveTextImportPlanningOptions({
      sourceName: 'mixed_notes.md',
      sourceType: 'paste',
      preprocessedHints: [
        {
          id: 'hint_1',
          kind: 'heading',
          text: 'Notes',
          raw: '# Notes',
          level: 1,
          lineStart: 1,
          lineEnd: 1,
          sourcePath: ['Notes'],
          language: null,
          rows: undefined,
        },
        {
          id: 'hint_2',
          kind: 'bullet_list',
          text: 'Capture ideas\nTrack questions',
          raw: '- Capture ideas\n- Track questions',
          level: 0,
          lineStart: 2,
          lineEnd: 3,
          sourcePath: ['Notes'],
          items: ['Capture ideas', 'Track questions'],
          checked: undefined,
          language: null,
          rows: undefined,
        },
        {
          id: 'hint_3',
          kind: 'paragraph',
          text: 'Decision: maybe launch later. This is still a rough note dump with several possibilities.',
          raw: 'Decision: maybe launch later. This is still a rough note dump with several possibilities.',
          level: 0,
          lineStart: 4,
          lineEnd: 4,
          sourcePath: ['Notes'],
          language: null,
          rows: undefined,
        },
      ],
    })

    expect(planning.resolvedPreset).toMatch(/preserve|distill|action_first/)
    expect(planning.summary.confidence).toBe('low')
  })
})
