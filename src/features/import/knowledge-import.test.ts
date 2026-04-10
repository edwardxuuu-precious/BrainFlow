import { describe, expect, it } from 'vitest'
import type { KnowledgeImportBundle } from '../../../shared/ai-contract'
import { createMindMapDocument } from '../documents/document-factory'
import {
  getLegacyGtmRepairAvailability,
  repairKnowledgeImportBundle,
  syncTextImportResponseActiveProjection,
} from './knowledge-import'
import GTM_MAIN_FIXTURE from './__fixtures__/GTM_main.md?raw'
import { createLocalTextImportPreview } from './local-text-import-core'
import { buildAiContext } from '../ai/ai-context'
import { preprocessTextToImportHints } from './text-import-preprocess'

function createLegacyTopic(id: string, parentId: string, title: string) {
  return {
    id,
    parentId,
    childIds: [],
    title,
    note: '',
    noteRich: null,
    aiLocked: false,
    isCollapsed: false,
    branchSide: 'auto' as const,
    layout: {
      offsetX: 0,
      offsetY: 0,
      semanticGroupKey: null,
      priority: null,
    },
    metadata: {
      labels: [],
      markers: [],
      stickers: [],
      type: 'normal' as const,
    },
    style: {
      emphasis: 'normal' as const,
      variant: 'default' as const,
    },
  }
}

function createLegacyBundle(
  documentRootTopicId: string,
  overrides: Partial<KnowledgeImportBundle> = {},
): KnowledgeImportBundle {
  const viewId = 'bundle_gtm_thinking'

  return {
    id: 'bundle_gtm',
    title: 'Import batch: GTM',
    createdAt: 1,
    anchorTopicId: documentRootTopicId,
    defaultViewId: viewId,
    activeViewId: viewId,
    mountedRootTopicId: null,
    sources: [
      {
        id: 'source_1',
        type: 'file',
        title: 'GTM_main',
        raw_content: GTM_MAIN_FIXTURE,
        metadata: {
          sourceName: 'GTM_main.md',
        },
      },
    ],
    semanticNodes: [
      {
        id: 'semantic_gtm_root',
        type: 'question',
        title: 'First wave target',
        summary: 'First wave target',
        detail: '',
        source_refs: [],
        confidence: 'high',
        task: null,
      },
    ],
    semanticEdges: [],
    views: [
      {
        id: viewId,
        type: 'thinking_view',
        visible_node_ids: ['semantic_gtm_root'],
        layout_type: 'mindmap',
      },
    ],
    viewProjections: {
      [viewId]: {
        viewId,
        viewType: 'thinking_view',
        summary: 'Legacy GTM projection',
        nodePlans: [
          {
            id: 'semantic_gtm_root',
            parentId: null,
            order: 0,
            title: 'First wave target',
            note: null,
            semanticRole: 'question',
            semanticType: 'question',
            confidence: 'high',
            sourceAnchors: [],
            groupKey: 'root',
            priority: 'primary',
            collapsedByDefault: false,
            templateSlot: null,
          },
        ],
        previewNodes: [
          {
            id: 'semantic_gtm_root',
            parentId: null,
            order: 0,
            title: 'First wave target',
            note: null,
            relation: 'new',
            matchedTopicId: null,
            reason: null,
            semanticRole: 'question',
            semanticType: 'question',
            confidence: 'high',
            sourceAnchors: [],
            templateSlot: null,
          },
        ],
        operations: [],
      },
    },
    ...overrides,
  }
}

describe('knowledge-import', () => {
  it('detects legacy GTM bundles from the old fixed semantic node ids', () => {
    const document = createMindMapDocument('Legacy bundle')
    const bundle = createLegacyBundle(document.rootTopicId)

    expect(getLegacyGtmRepairAvailability(bundle)).toEqual({
      isLegacyGtmBundle: true,
      canRepair: true,
      reason: null,
    })
  })

  it('detects the repeated-title note regression even without old semantic ids', () => {
    const document = createMindMapDocument('Legacy bundle')
    const bundle = createLegacyBundle(document.rootTopicId, {
      semanticNodes: [],
      views: [
        {
          id: 'bundle_gtm_thinking',
          type: 'thinking_view',
          visible_node_ids: ['legacy_root'],
          layout_type: 'mindmap',
        },
      ],
      viewProjections: {
        bundle_gtm_thinking: {
          viewId: 'bundle_gtm_thinking',
          viewType: 'thinking_view',
          summary: 'Legacy GTM projection',
          nodePlans: [],
          previewNodes: [
            {
              id: 'legacy_root',
              parentId: null,
              order: 0,
              title: 'Criteria',
              note: 'Criteria Criteria Criteria Criteria merged note content.',
              relation: 'new',
              matchedTopicId: null,
              reason: null,
            },
          ],
          operations: [],
        },
      },
    })

    expect(getLegacyGtmRepairAvailability(bundle).isLegacyGtmBundle).toBe(true)
  })

  it('repairs a legacy GTM bundle from stored source content and replaces the mounted subtree', () => {
    const document = createMindMapDocument('Legacy repair')
    const legacyMountedRootId = 'topic_legacy_import'

    document.topics[legacyMountedRootId] = createLegacyTopic(
      legacyMountedRootId,
      document.rootTopicId,
      'Legacy GTM import',
    )
    document.topics[document.rootTopicId].childIds.push(legacyMountedRootId)
    document.knowledgeImports.bundle_gtm = createLegacyBundle(document.rootTopicId, {
      mountedRootTopicId: legacyMountedRootId,
    })

    const result = repairKnowledgeImportBundle(document, 'bundle_gtm')

    expect(result).not.toBeNull()
    expect(result?.document.topics[legacyMountedRootId]).toBeUndefined()
    expect(result?.document.workspace.activeImportBundleId).toBe('bundle_gtm')
    expect(result?.document.workspace.activeKnowledgeViewId).toBe('thinking_view')
    expect(result?.selectedTopicId).toBe(result?.document.knowledgeImports.bundle_gtm.mountedRootTopicId)
    expect(result?.document.knowledgeImports.bundle_gtm.mountedRootTopicId).not.toBe(legacyMountedRootId)
    expect(
      result?.document.knowledgeImports.bundle_gtm.semanticNodes.some((node) =>
        node.id.startsWith('semantic_gtm_'),
      ),
    ).toBe(false)
    expect(
      result?.document.knowledgeImports.bundle_gtm.viewProjections[
        result.document.knowledgeImports.bundle_gtm.activeViewId
      ]?.previewNodes.find((node) => node.parentId === null)?.title,
    ).toBe('证据问题：我们手上有什么渠道')
  })

  it('keeps the same semantic spine when rehydrating a local conversation-export response', () => {
    const document = createMindMapDocument('Conversation import')
    const rawText = [
      '# Markdown 记录',
      '',
      '## Turn 1 · User',
      'Should we lead with SMB or agencies?',
      '',
      '## Turn 1 · Assistant',
      '### 结论',
      'Start with SMB accounts.',
      '',
      '### 拆解',
      '#### 需求强度',
      'SMB teams feel the problem weekly.',
      '#### 触达效率',
      'Founder outreach reaches SMB buyers quickly.',
      '#### 下一步',
      '- Create a 20-account SMB prospect list.',
    ].join('\n')
    const response = createLocalTextImportPreview({
      documentId: document.id,
      documentTitle: document.title,
      baseDocumentUpdatedAt: document.updatedAt,
      context: buildAiContext(document, [document.rootTopicId], document.rootTopicId),
      anchorTopicId: document.rootTopicId,
      sourceName: 'conversation_export.md',
      sourceType: 'file',
      intent: 'distill_structure',
      rawText,
      preprocessedHints: preprocessTextToImportHints(rawText),
      semanticHints: [],
    }).response

    const activeViewId = response.activeViewId ?? response.defaultViewId
    expect(activeViewId).not.toBeNull()
    const projection = response.viewProjections[activeViewId!]
    const synced = syncTextImportResponseActiveProjection(response, projection)

    expect(synced.previewNodes[0]?.title).toBe(response.previewNodes[0]?.title)
    expect(synced.previewNodes.some((node) => node.title === 'Markdown 记录')).toBe(false)
    expect(synced.previewNodes.some((node) => node.title === 'Turn 1 · User')).toBe(false)
    expect(synced.previewNodes.some((node) => node.title === 'Turn 1 · Assistant')).toBe(false)
  })

  it('refuses repair when the legacy bundle no longer has rebuildable source content', () => {
    const document = createMindMapDocument('Legacy repair')
    const bundle = createLegacyBundle(document.rootTopicId, {
      sources: [
        {
          id: 'source_1',
          type: 'file',
          title: 'GTM_main',
          raw_content: '',
          metadata: {
            sourceName: 'GTM_main.md',
          },
        },
      ],
    })

    document.knowledgeImports.bundle_gtm = bundle

    const availability = getLegacyGtmRepairAvailability(bundle)

    expect(availability.isLegacyGtmBundle).toBe(true)
    expect(availability.canRepair).toBe(false)
    expect(availability.reason).toBeTruthy()
    expect(repairKnowledgeImportBundle(document, 'bundle_gtm')).toBeNull()
  })
})
