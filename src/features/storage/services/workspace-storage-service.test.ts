import JSZip from 'jszip'
import { describe, expect, test } from 'vitest'
import { workspaceStorageService } from './workspace-storage-service'

describe('workspaceStorageService', () => {
  test('exports and imports backup, remapping duplicate document ids to copies', async () => {
    const document = await workspaceStorageService.documentRepository.createDocument('Roundtrip')
    const conversation = workspaceStorageService.conversationRepository.createEmptyConversation(
      document.id,
      document.title,
      'session_roundtrip',
    )
    await workspaceStorageService.conversationRepository.saveSession(conversation)

    const blob = await workspaceStorageService.exportBackup()
    const file = new File([await blob.arrayBuffer()], 'brainflow-backup.zip', {
      type: 'application/zip',
    })
    const report = await workspaceStorageService.importBackup(file)

    expect(report.success).toBe(true)
    expect(report.importedDocuments).toBe(1)
    expect(report.importedConversations).toBe(1)
    expect(report.duplicatedDocuments).toHaveLength(1)

    const documents = await workspaceStorageService.documentRepository.listAllDocuments()
    expect(documents).toHaveLength(2)
    expect(documents.some((entry) => entry.title.endsWith('（导入副本）'))).toBe(true)
    expect(documents.every((entry) => entry.title.length <= 50)).toBe(true)

    const sessions = await workspaceStorageService.conversationRepository.listAllSessions({
      includeArchived: true,
    })
    expect(sessions).toHaveLength(2)
    expect(new Set(sessions.map((session) => session.documentId)).size).toBe(2)
  })

  test('blocks import when manifest schema version is incompatible', async () => {
    const archive = new JSZip()
    archive.file(
      'manifest.json',
      JSON.stringify(
        {
          schemaVersion: 'brainflow-backup-v999',
          createdAt: Date.now(),
          exportedAt: Date.now(),
          appVersion: '0.0.0',
          documentCount: 0,
          conversationCount: 0,
          entries: [],
        },
        null,
        2,
      ),
    )
    const blob = await archive.generateAsync({ type: 'blob' })
    const file = new File([await blob.arrayBuffer()], 'invalid-backup.zip', {
      type: 'application/zip',
    })

    const report = await workspaceStorageService.importBackup(file)

    expect(report.success).toBe(false)
    expect(report.failures[0]?.kind).toBe('manifest')
  })
})
