import { describe, expect, it } from 'vitest'
import type { TextImportProgressEntry, TextImportTraceEntry } from '../../../shared/ai-contract'
import {
  buildTextImportActivityBlocks,
  formatTextImportActivityLead,
} from './text-import-activity'

function createTraceEntry(overrides: Partial<TextImportTraceEntry> = {}): TextImportTraceEntry {
  return {
    id: 'trace_1',
    sequence: 1,
    timestampMs: 1_000,
    attempt: 'primary',
    channel: 'codex',
    eventType: 'item.delta',
    payload: {
      item: {
        text_delta: 'Thinking through launch order',
      },
    },
    currentFileName: 'Launch.md',
    ...overrides,
  }
}

function createProgressEntry(
  overrides: Partial<TextImportProgressEntry> = {},
): TextImportProgressEntry {
  return {
    id: 'progress_1',
    timestampMs: 1_000,
    stage: 'parsing_markdown',
    message: '正在解析本地 Markdown 结构。',
    tone: 'info',
    source: 'status',
    attempt: 'local',
    currentFileName: 'Notes.md',
    ...overrides,
  }
}

describe('text-import-activity', () => {
  it('merges commentary deltas with the final assistant message', () => {
    const blocks = buildTextImportActivityBlocks({
      jobMode: 'codex_import',
      jobType: 'single',
      traceEntries: [
        createTraceEntry({
          id: 'delta_1',
          sequence: 1,
          payload: {
            item: {
              text_delta: 'Thinking through ',
            },
          },
        }),
        createTraceEntry({
          id: 'delta_2',
          sequence: 2,
          timestampMs: 2_000,
          payload: {
            item: {
              text_delta: 'launch order',
            },
          },
        }),
        createTraceEntry({
          id: 'done_1',
          sequence: 3,
          timestampMs: 3_000,
          eventType: 'item.completed',
          payload: {
            item: {
              type: 'agent_message',
              text: 'Thinking through launch order',
            },
          },
        }),
      ],
      progressEntries: [],
      statusText: '',
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      kind: 'commentary',
      message: 'Thinking through launch order',
    })
  })

  it('groups consecutive tool events into a single activity block', () => {
    const blocks = buildTextImportActivityBlocks({
      jobMode: 'codex_import',
      jobType: 'single',
      traceEntries: [
        createTraceEntry({
          id: 'tool_1',
          sequence: 1,
          eventType: 'item.started',
          payload: {
            item: {
              type: 'command_execution',
              command: 'npm test',
            },
          },
        }),
        createTraceEntry({
          id: 'tool_2',
          sequence: 2,
          timestampMs: 2_000,
          eventType: 'item.completed',
          payload: {
            item: {
              type: 'web_search',
              query: 'shopify cli install',
            },
          },
        }),
      ],
      progressEntries: [],
      statusText: '',
    })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      kind: 'tool_group',
      summary: '已运行 1 个命令，搜索网页 1 次。',
      lines: ['已运行 npm test', '已搜索网页 (shopify cli install)'],
    })
  })

  it('emits waiting and repair marker blocks from real trace events', () => {
    const blocks = buildTextImportActivityBlocks({
      jobMode: 'codex_import',
      jobType: 'single',
      traceEntries: [
        createTraceEntry({
          id: 'request_1',
          sequence: 1,
          channel: 'request',
          eventType: 'request.dispatched',
          payload: { kind: 'structured' },
        }),
        createTraceEntry({
          id: 'heartbeat_1',
          sequence: 2,
          channel: 'runner',
          eventType: 'heartbeat',
          payload: {
            phase: 'heartbeat',
            elapsedSinceLastEventMs: 9_000,
          },
        }),
        createTraceEntry({
          id: 'repair_request',
          sequence: 3,
          timestampMs: 3_000,
          attempt: 'repair',
          channel: 'request',
          eventType: 'request.dispatched',
          payload: { kind: 'structured' },
        }),
      ],
      progressEntries: [],
      statusText: '',
    })

    expect(blocks.map((block) => block.kind)).toEqual(['request', 'waiting', 'attempt_marker', 'request'])
    expect(blocks[1]).toMatchObject({
      kind: 'waiting',
      message: '仍在等待 Codex 返回，已等待 9s。',
    })
    expect(blocks[2]).toMatchObject({
      kind: 'attempt_marker',
      message: '主结果需要修复，正在进入修复重试。',
    })
  })

  it('builds local import activity from progress entries only', () => {
    const blocks = buildTextImportActivityBlocks({
      jobMode: 'local_markdown',
      jobType: 'single',
      traceEntries: [],
      progressEntries: [
        createProgressEntry(),
        createProgressEntry({
          id: 'progress_2',
          timestampMs: 2_000,
          stage: 'analyzing_import',
          message: '正在整理本地导入预览。',
        }),
      ],
      statusText: '',
    })

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({
      kind: 'local_status',
      message: '正在解析本地 Markdown 结构。',
    })
    expect(blocks[1]).toMatchObject({
      kind: 'local_status',
      message: '正在整理本地导入预览。',
    })
  })

  it('prefixes file names only for batch imports', () => {
    expect(formatTextImportActivityLead('Launch.md', '已发送结构化导入请求。', false)).toBe(
      '已发送结构化导入请求。',
    )
    expect(formatTextImportActivityLead('Launch.md', '已发送结构化导入请求。', true)).toBe(
      'Launch.md | 已发送结构化导入请求。',
    )
  })
})
