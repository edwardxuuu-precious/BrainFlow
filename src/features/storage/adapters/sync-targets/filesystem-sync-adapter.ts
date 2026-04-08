import type { AiConversation } from '../../../../../shared/ai-contract'
import type { MindMapDocument } from '../../../documents/types'
import type {
  SyncResourceDescriptor,
  SyncTargetAdapter,
  SyncTargetConnection,
  SyncTargetSnapshot,
} from '../../core/sync-types'
import { computeContentHash } from '../../core/content-hash'
import {
  type SyncFolderManifest,
  type SyncFolderManifestEntry,
  type SyncFolderState,
} from '../backup/backup-schema'
import { FilesystemHandleStore } from './filesystem-handle-store'

const FOLDER_SCHEMA_VERSION = 'brainflow-folder-sync-v1'
const FOLDER_STATE_SCHEMA_VERSION = 'brainflow-folder-sync-state-v1'

function isFilesystemSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function ensurePermission(handle: FileSystemHandle): Promise<boolean> {
  const permissionHandle = handle as FileSystemHandle & {
    queryPermission: (options: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission: (options: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  const current = await permissionHandle.queryPermission({ mode: 'readwrite' })
  if (current === 'granted') {
    return true
  }

  return (await permissionHandle.requestPermission({ mode: 'readwrite' })) === 'granted'
}

async function readJsonFile<T>(
  directory: FileSystemDirectoryHandle,
  pathSegments: string[],
): Promise<T | null> {
  try {
    let current: FileSystemDirectoryHandle = directory
    for (const segment of pathSegments.slice(0, -1)) {
      current = await current.getDirectoryHandle(segment)
    }

    const fileHandle = await current.getFileHandle(pathSegments[pathSegments.length - 1])
    const file = await fileHandle.getFile()
    return JSON.parse(await file.text()) as T
  } catch {
    return null
  }
}

async function writeJsonFile(
  directory: FileSystemDirectoryHandle,
  pathSegments: string[],
  value: unknown,
): Promise<void> {
  let current = directory
  for (const segment of pathSegments.slice(0, -1)) {
    current = await current.getDirectoryHandle(segment, { create: true })
  }

  const fileHandle = await current.getFileHandle(pathSegments[pathSegments.length - 1], {
    create: true,
  })
  const writable = await fileHandle.createWritable()
  await writable.write(`${JSON.stringify(value, null, 2)}\n`)
  await writable.close()
}

async function removeFile(
  directory: FileSystemDirectoryHandle,
  pathSegments: string[],
): Promise<void> {
  try {
    let current = directory
    for (const segment of pathSegments.slice(0, -1)) {
      current = await current.getDirectoryHandle(segment)
    }

    await current.removeEntry(pathSegments[pathSegments.length - 1])
  } catch {
    // Ignore missing files.
  }
}

async function listFilesRecursive(
  directory: FileSystemDirectoryHandle,
  prefix: string[] = [],
): Promise<Array<{ pathSegments: string[]; handle: FileSystemFileHandle }>> {
  const files: Array<{ pathSegments: string[]; handle: FileSystemFileHandle }> = []
  const iterableDirectory = directory as FileSystemDirectoryHandle & {
    entries(): AsyncIterable<[string, FileSystemHandle]>
  }

  for await (const [name, entry] of iterableDirectory.entries()) {
    const pathSegments = [...prefix, name]
    if (entry.kind === 'file') {
      files.push({ pathSegments, handle: entry as FileSystemFileHandle })
      continue
    }

    files.push(...(await listFilesRecursive(entry as FileSystemDirectoryHandle, pathSegments)))
  }

  return files
}

function createEmptyManifest(): SyncFolderManifest {
  const now = Date.now()
  return {
    schemaVersion: FOLDER_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    entries: [],
  }
}

function createEmptyFolderState(): SyncFolderState {
  return {
    schemaVersion: FOLDER_STATE_SCHEMA_VERSION,
    updatedAt: Date.now(),
    lastSuccessfulWriteAt: null,
  }
}

function buildDocumentEntry(documentId: string): SyncFolderManifestEntry {
  return {
    kind: 'document',
    id: documentId,
    documentId,
    sessionId: null,
    path: `documents/${documentId}.json`,
    updatedAt: null,
    hash: null,
  }
}

function buildConversationEntry(documentId: string, sessionId: string): SyncFolderManifestEntry {
  return {
    kind: 'conversation',
    id: `${documentId}:${sessionId}`,
    documentId,
    sessionId,
    path: `conversations/${documentId}/${sessionId}.json`,
    updatedAt: null,
    hash: null,
  }
}

export class FilesystemSyncTargetAdapter implements SyncTargetAdapter {
  readonly kind = 'filesystem' as const
  private readonly handleStore: FilesystemHandleStore

  constructor(handleStore: FilesystemHandleStore) {
    this.handleStore = handleStore
  }

  isSupported(): boolean {
    return isFilesystemSupported()
  }

  async connect(): Promise<SyncTargetConnection> {
    if (!this.isSupported()) {
      throw new Error('当前浏览器不支持同步文件夹连接。')
    }

    const pickerWindow = window as Window & typeof globalThis & {
      showDirectoryPicker: (options?: { mode?: 'readwrite' | 'read' }) => Promise<FileSystemDirectoryHandle>
    }
    const handle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' })
    const granted = await ensurePermission(handle)
    if (!granted) {
      throw new Error('未获得同步文件夹的读写权限。')
    }

    const connection: SyncTargetConnection = {
      id: `filesystem:${handle.name}`,
      kind: 'filesystem',
      label: handle.name,
      connectedAt: Date.now(),
    }

    await Promise.all([
      this.handleStore.setConnection(connection),
      this.handleStore.setDirectoryHandle(handle),
      writeJsonFile(handle, ['manifest.json'], (await this.readManifest(handle)) ?? createEmptyManifest()),
      writeJsonFile(handle, ['settings', 'sync-state.json'], createEmptyFolderState()),
    ])

    return connection
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.handleStore.setConnection(null),
      this.handleStore.setDirectoryHandle(null),
    ])
  }

  private async getHandle(connection: SyncTargetConnection): Promise<FileSystemDirectoryHandle> {
    const handle = await this.handleStore.getDirectoryHandle()
    const storedConnection = await this.handleStore.getConnection()

    if (!handle || !storedConnection || storedConnection.id !== connection.id) {
      throw new Error('同步文件夹连接已失效，请重新连接。')
    }

    const granted = await ensurePermission(handle)
    if (!granted) {
      throw new Error('同步文件夹读写权限已失效，请重新授权。')
    }

    return handle
  }

  private async readManifest(handle: FileSystemDirectoryHandle): Promise<SyncFolderManifest | null> {
    const manifest = await readJsonFile<SyncFolderManifest>(handle, ['manifest.json'])
    if (!manifest || manifest.schemaVersion !== FOLDER_SCHEMA_VERSION) {
      return null
    }
    return manifest
  }

  private async writeManifest(
    handle: FileSystemDirectoryHandle,
    update: (manifest: SyncFolderManifest) => SyncFolderManifest,
  ): Promise<void> {
    const current = (await this.readManifest(handle)) ?? createEmptyManifest()
    const next = update(current)
    await writeJsonFile(handle, ['manifest.json'], {
      ...next,
      updatedAt: Date.now(),
    })
  }

  private async touchFolderState(handle: FileSystemDirectoryHandle): Promise<void> {
    const current = (await readJsonFile<SyncFolderState>(handle, ['settings', 'sync-state.json'])) ?? createEmptyFolderState()
    await writeJsonFile(handle, ['settings', 'sync-state.json'], {
      ...current,
      updatedAt: Date.now(),
      lastSuccessfulWriteAt: Date.now(),
    })
  }

  async scan(connection: SyncTargetConnection): Promise<SyncTargetSnapshot> {
    const handle = await this.getHandle(connection)
    const manifest = (await this.readManifest(handle)) ?? createEmptyManifest()
    const files = await listFilesRecursive(handle)
    const documents: MindMapDocument[] = []
    const conversations: AiConversation[] = []
    const resources: SyncResourceDescriptor[] = []

    for (const file of files) {
      const normalizedPath = file.pathSegments.join('/')
      if (normalizedPath === 'manifest.json' || normalizedPath === 'settings/sync-state.json') {
        continue
      }

      const raw = await file.handle.getFile()
      const parsed = JSON.parse(await raw.text()) as MindMapDocument | AiConversation
      const hash = await computeContentHash(parsed)
      const isDocument = normalizedPath.startsWith('documents/')
      const documentId = isDocument
        ? normalizedPath.replace(/^documents\//, '').replace(/\.json$/, '')
        : normalizedPath.split('/')[1] ?? 'unknown-document'
      const sessionId = isDocument ? null : normalizedPath.split('/')[2]?.replace(/\.json$/, '') ?? null

      if (isDocument) {
        documents.push(parsed as MindMapDocument)
      } else {
        conversations.push(parsed as AiConversation)
      }

      resources.push({
        resourceType: isDocument ? 'document' : 'conversation',
        resourceId: isDocument ? documentId : `${documentId}:${sessionId ?? 'unknown'}`,
        documentId,
        sessionId,
        path: normalizedPath,
        updatedAt: typeof (parsed as { updatedAt?: number }).updatedAt === 'number'
          ? (parsed as { updatedAt: number }).updatedAt
          : null,
        hash,
      })
    }

    return {
      connection,
      scannedAt: Date.now(),
      documents,
      conversations,
      manifestVersion: manifest.schemaVersion,
      resources,
    }
  }

  async writeDocument(connection: SyncTargetConnection, doc: MindMapDocument): Promise<void> {
    const handle = await this.getHandle(connection)
    const pathSegments = ['documents', `${doc.id}.json`]
    const hash = await computeContentHash(doc)
    const nextEntry = buildDocumentEntry(doc.id)

    await writeJsonFile(handle, pathSegments, doc)
    await this.writeManifest(handle, (manifest) => ({
      ...manifest,
      entries: [
        ...manifest.entries.filter((entry) => entry.id !== nextEntry.id),
        { ...nextEntry, updatedAt: doc.updatedAt, hash },
      ],
    }))
    await this.touchFolderState(handle)
  }

  async writeConversation(connection: SyncTargetConnection, session: AiConversation): Promise<void> {
    const handle = await this.getHandle(connection)
    const pathSegments = ['conversations', session.documentId, `${session.sessionId}.json`]
    const hash = await computeContentHash(session)
    const nextEntry = buildConversationEntry(session.documentId, session.sessionId)

    await writeJsonFile(handle, pathSegments, session)
    await this.writeManifest(handle, (manifest) => ({
      ...manifest,
      entries: [
        ...manifest.entries.filter((entry) => entry.id !== nextEntry.id),
        { ...nextEntry, updatedAt: session.updatedAt, hash },
      ],
    }))
    await this.touchFolderState(handle)
  }

  async deleteDocument(connection: SyncTargetConnection, documentId: string): Promise<void> {
    const handle = await this.getHandle(connection)
    await removeFile(handle, ['documents', `${documentId}.json`])
    await this.writeManifest(handle, (manifest) => ({
      ...manifest,
      entries: manifest.entries.filter((entry) => entry.id !== documentId),
    }))
    await this.touchFolderState(handle)
  }

  async deleteConversation(connection: SyncTargetConnection, documentId: string, sessionId: string): Promise<void> {
    const handle = await this.getHandle(connection)
    await removeFile(handle, ['conversations', documentId, `${sessionId}.json`])
    await this.writeManifest(handle, (manifest) => ({
      ...manifest,
      entries: manifest.entries.filter((entry) => entry.id !== `${documentId}:${sessionId}`),
    }))
    await this.touchFolderState(handle)
  }
}
