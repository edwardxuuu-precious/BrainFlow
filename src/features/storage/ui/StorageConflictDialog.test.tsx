import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StorageConflictRecord } from '../domain/sync-records'
import { StorageConflictDialog } from './StorageConflictDialog'

function createConflict(overrides?: Partial<StorageConflictRecord>): StorageConflictRecord {
  return {
    id: 'conflict_1',
    workspaceId: 'workspace_1',
    entityType: 'document',
    entityId: 'doc_1',
    deviceId: 'device_1',
    localRecord: {
      id: 'doc_1',
      userId: 'user_1',
      workspaceId: 'workspace_1',
      deviceId: 'device_1',
      version: 2,
      baseVersion: 1,
      contentHash: 'hash_local',
      updatedAt: 400,
      deletedAt: null,
      syncStatus: 'conflict',
      payload: {
        title: 'Local title',
        updatedAt: 400,
        topics: {
          topic_1: { id: 'topic_1', title: 'Local topic' },
        },
      } as never,
    },
    cloudRecord: {
      id: 'doc_1',
      userId: 'user_1',
      workspaceId: 'workspace_1',
      deviceId: 'device_2',
      version: 3,
      baseVersion: 2,
      contentHash: 'hash_cloud',
      updatedAt: 300,
      deletedAt: null,
      syncStatus: 'conflict',
      payload: {
        title: 'Cloud title',
        updatedAt: 300,
        topics: {
          topic_1: { id: 'topic_1', title: 'Cloud topic' },
        },
      } as never,
    },
    localPayload: {
      title: 'Local title',
      updatedAt: 400,
      topics: {
        topic_1: { id: 'topic_1', title: 'Local topic' },
      },
    } as never,
    cloudPayload: {
      title: 'Cloud title',
      updatedAt: 300,
      topics: {
        topic_1: { id: 'topic_1', title: 'Cloud topic' },
      },
    } as never,
    diffHints: {
      updatedAtDeltaMs: -100,
      sameContentHash: false,
    },
    analysisStatus: 'ready',
    analysisSource: 'heuristic',
    recommendedResolution: 'merged_payload',
    confidence: 'medium',
    summary: '本地更新时间更晚，建议采用本地较新版本。',
    reasons: ['当前按更新时间给出建议，请结合差异确认。'],
    actionableResolutions: ['merged_payload', 'use_cloud', 'save_local_copy'],
    mergedPayload: {
      title: 'Local title',
      updatedAt: 400,
      topics: {
        topic_1: { id: 'topic_1', title: 'Local topic' },
      },
    } as never,
    analyzedAt: 500,
    analysisNote: '系统只根据更新时间给出建议，不会自动覆盖任何一侧内容。',
    detectedAt: 400,
    resolvedAt: null,
    ...overrides,
  }
}

describe('StorageConflictDialog', () => {
  it('shows a time-based recommendation and the structured diff list', () => {
    render(
      <StorageConflictDialog
        conflict={createConflict()}
        onResolve={vi.fn().mockResolvedValue(undefined)}
        onDiscardLocalConflict={vi.fn().mockResolvedValue(undefined)}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByTestId('storage-conflict-recommendation-card')).toHaveTextContent('采用本地较新版本')
    expect(screen.getByTestId('storage-conflict-diff')).toHaveTextContent('共发现')
    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('本地：Local title')).toBeInTheDocument()
    expect(screen.getByText('主库：Cloud title')).toBeInTheDocument()
  })

  it('shows a non-AI pending message for legacy pending conflicts', () => {
    render(
      <StorageConflictDialog
        conflict={createConflict({
          analysisStatus: 'pending',
          analysisSource: null,
          recommendedResolution: null,
          confidence: null,
          summary: null,
          reasons: [],
          actionableResolutions: [],
          mergedPayload: null,
          analyzedAt: null,
        })}
        onResolve={vi.fn().mockResolvedValue(undefined)}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getByText('正在整理差异')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '正在整理建议...' })).toBeDisabled()
  })

  it('hides the main-database action when the server record is missing', () => {
    render(
      <StorageConflictDialog
        conflict={createConflict({
          cloudRecord: null,
          cloudPayload: null,
          analysisSource: 'heuristic',
          recommendedResolution: 'save_local_copy',
          confidence: 'high',
          summary: '主库没有记录，建议保留本地副本。',
          reasons: ['主库记录缺失。'],
          actionableResolutions: ['save_local_copy'],
          mergedPayload: null,
        })}
        onResolve={vi.fn().mockResolvedValue(undefined)}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '采用主库较新版本' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保留本地并另存副本' })).toBeInTheDocument()
  })

  it('allows discarding the local record when the main-database record is missing', async () => {
    const user = userEvent.setup()
    const onDiscardLocalConflict = vi.fn().mockResolvedValue(undefined)

    render(
      <StorageConflictDialog
        conflict={createConflict({
          cloudRecord: null,
          cloudPayload: null,
          analysisSource: 'heuristic',
          recommendedResolution: 'save_local_copy',
          confidence: 'high',
          summary: '主库没有记录，建议保留本地副本。',
          reasons: ['主库记录缺失。'],
          actionableResolutions: ['save_local_copy'],
          mergedPayload: null,
        })}
        onResolve={vi.fn().mockResolvedValue(undefined)}
        onDiscardLocalConflict={onDiscardLocalConflict}
        onDismiss={vi.fn()}
      />,
    )

    await user.click(screen.getByTestId('storage-conflict-discard-local'))

    expect(onDiscardLocalConflict).toHaveBeenCalledWith('conflict_1')
  })

  it('passes the local payload when the user confirms the newer local version', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn().mockResolvedValue(undefined)

    render(
      <StorageConflictDialog
        conflict={createConflict()}
        onResolve={onResolve}
        onDismiss={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '采用本地较新版本' }))

    expect(onResolve).toHaveBeenCalledWith(
      'conflict_1',
      'merged_payload',
      {
        title: 'Local title',
        updatedAt: 400,
        topics: {
          topic_1: { id: 'topic_1', title: 'Local topic' },
        },
      },
    )
  })

  it('shows an inline error and keeps dismissal available when resolution fails', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn().mockRejectedValue(new Error('Conflict not found.'))

    function Harness() {
      const [conflict, setConflict] = useState<StorageConflictRecord | null>(
        createConflict({
          recommendedResolution: 'save_local_copy',
          actionableResolutions: ['save_local_copy'],
          mergedPayload: null,
        }),
      )

      return (
        <StorageConflictDialog
          conflict={conflict}
          onResolve={onResolve}
          onDismiss={() => setConflict(null)}
        />
      )
    }

    render(<Harness />)

    await user.click(screen.getByTestId('storage-conflict-action-save_local_copy'))

    const error = await screen.findByTestId('storage-conflict-resolve-error')
    expect(error).toHaveTextContent('主库已经找不到这条冲突')
    expect(screen.getByTestId('storage-conflict-action-save_local_copy')).not.toBeDisabled()
    expect(screen.getByTestId('storage-conflict-dialog')).toBeInTheDocument()

    await user.click(screen.getByTestId('storage-conflict-dismiss'))

    expect(screen.queryByTestId('storage-conflict-dialog')).not.toBeInTheDocument()
  })
})
