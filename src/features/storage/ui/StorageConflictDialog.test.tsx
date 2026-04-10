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
      updatedAt: 200,
      deletedAt: null,
      syncStatus: 'conflict',
      payload: {
        title: 'Local title',
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
      } as never,
    },
    localPayload: {
      title: 'Local title',
    } as never,
    cloudPayload: {
      title: 'Cloud title',
    } as never,
    diffHints: {
      updatedAtDeltaMs: 100,
      sameContentHash: false,
    },
    analysisStatus: 'ready',
    analysisSource: 'ai',
    recommendedResolution: 'merged_payload',
    confidence: 'high',
    summary: '推荐采用合并建议。',
    reasons: ['两侧都包含有效改动。'],
    actionableResolutions: ['use_cloud', 'save_local_copy', 'merged_payload'],
    mergedPayload: {
      title: 'Merged title',
    } as never,
    analyzedAt: 500,
    analysisNote: null,
    detectedAt: 400,
    resolvedAt: null,
    ...overrides,
  }
}

describe('StorageConflictDialog', () => {
  it('shows a loading state while analysis is pending', () => {
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

    expect(screen.getByText('正在分析冲突')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '正在分析…' })).toBeDisabled()
  })

  it('hides the cloud action when the cloud record is missing', () => {
    render(
      <StorageConflictDialog
        conflict={createConflict({
          cloudRecord: null,
          cloudPayload: null,
          analysisSource: 'heuristic',
          recommendedResolution: 'save_local_copy',
          confidence: 'high',
          summary: '云端没有记录，建议保留本地副本。',
          reasons: ['云端记录缺失。'],
          actionableResolutions: ['save_local_copy'],
          mergedPayload: null,
        })}
        onResolve={vi.fn().mockResolvedValue(undefined)}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '采用云端版本' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保留本地并另存副本' })).toBeInTheDocument()
  })

  it('passes merged payload when the user confirms the merge recommendation', async () => {
    const user = userEvent.setup()
    const onResolve = vi.fn().mockResolvedValue(undefined)

    render(
      <StorageConflictDialog
        conflict={createConflict()}
        onResolve={onResolve}
        onDismiss={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '采用合并建议' }))

    expect(onResolve).toHaveBeenCalledWith(
      'conflict_1',
      'merged_payload',
      {
        title: 'Merged title',
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
    expect(error).toHaveTextContent('云端已经找不到这条冲突')
    expect(screen.getByTestId('storage-conflict-action-save_local_copy')).not.toBeDisabled()
    expect(screen.getByTestId('storage-conflict-dialog')).toBeInTheDocument()

    await user.click(screen.getByTestId('storage-conflict-dismiss'))

    expect(screen.queryByTestId('storage-conflict-dialog')).not.toBeInTheDocument()
  })
})
