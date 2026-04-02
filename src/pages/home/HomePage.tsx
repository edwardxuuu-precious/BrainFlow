import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  documentService,
  getRecentDocumentId,
  setRecentDocumentId,
} from '../../features/documents/document-service'
import type { DocumentService, DocumentSummary } from '../../features/documents/types'
import styles from './HomePage.module.css'

interface HomePageProps {
  service?: DocumentService
}

function formatUpdatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}

export function HomePage({ service = documentService }: HomePageProps) {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [recentId, setRecentIdState] = useState<string | null>(() => getRecentDocumentId())
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  const recentDocument = useMemo(
    () => documents.find((document) => document.id === recentId) ?? documents[0] ?? null,
    [documents, recentId],
  )

  const refreshDocuments = useCallback(async () => {
    setLoading(true)
    const nextDocuments = await service.listDocuments()
    setDocuments(nextDocuments)
    setRecentIdState(getRecentDocumentId())
    setLoading(false)
  }, [service])

  useEffect(() => {
    const frameId = window.setTimeout(() => {
      void refreshDocuments()
    }, 0)

    return () => window.clearTimeout(frameId)
  }, [refreshDocuments])

  const openDocument = (id: string) => {
    setRecentDocumentId(id)
    setRecentIdState(id)
    navigate(`/map/${id}`)
  }

  const handleCreate = async () => {
    const document = await service.createDocument()
    openDocument(document.id)
  }

  const beginRename = (document: DocumentSummary) => {
    setEditingId(document.id)
    setDraftTitle(document.title)
  }

  const commitRename = async (documentId: string) => {
    const normalizedTitle = draftTitle.trim()
    setEditingId(null)

    if (!normalizedTitle) {
      setDraftTitle('')
      return
    }

    const document = await service.getDocument(documentId)
    if (!document || document.title === normalizedTitle) {
      await refreshDocuments()
      return
    }

    await service.saveDocument({
      ...document,
      title: normalizedTitle,
    })
    await refreshDocuments()
  }

  const cancelRename = () => {
    setEditingId(null)
    setDraftTitle('')
  }

  const handleDuplicate = async (documentId: string) => {
    const duplicatedId = await service.duplicateDocument(documentId)
    setRecentDocumentId(duplicatedId)
    await refreshDocuments()
  }

  const handleDelete = async (documentId: string) => {
    await service.deleteDocument(documentId)
    await refreshDocuments()
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brandBlock}>
          <span className={styles.eyebrow}>BrainFlow</span>
          <h1 className={styles.title}>本地脑图工作台</h1>
          <p className={styles.subtitle}>简洁的 XMind 式思路整理体验，文档默认只保存在你的浏览器里。</p>
        </div>

        <div className={styles.headerActions}>
          {recentDocument ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => openDocument(recentDocument.id)}
            >
              继续最近文档
            </button>
          ) : null}
          <button type="button" className={styles.primaryButton} onClick={handleCreate}>
            新建脑图
          </button>
        </div>
      </header>

      <section className={styles.workspace}>
        <div className={styles.toolbar}>
          <div>
            <p className={styles.sectionLabel}>文档</p>
            <h2 className={styles.sectionTitle}>
              {loading ? '正在读取本地文档…' : `共 ${documents.length} 份脑图`}
            </h2>
          </div>
          <p className={styles.sectionHint}>双击标题可编辑，点击整行可直接进入编辑器。</p>
        </div>

        <div className={styles.list}>
          {loading ? (
            <div className={styles.emptyState}>正在读取本地文档…</div>
          ) : documents.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>还没有脑图</p>
              <p className={styles.emptyText}>先创建一份新文档，中心主题和两条一级分支会自动准备好。</p>
            </div>
          ) : (
            documents.map((document) => {
              const isEditing = editingId === document.id

              return (
                <article
                  key={document.id}
                  className={styles.row}
                  onClick={() => openDocument(document.id)}
                >
                  <div className={styles.rowMain}>
                    <span
                      className={styles.colorDot}
                      style={{ backgroundColor: document.previewColor }}
                      aria-hidden="true"
                    />
                    <div className={styles.rowCopy}>
                      {isEditing ? (
                        <input
                          aria-label="重命名脑图"
                          className={styles.renameInput}
                          value={draftTitle}
                          autoFocus
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onBlur={() => void commitRename(document.id)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void commitRename(document.id)
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault()
                              cancelRename()
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className={styles.nameButton}
                          onDoubleClick={(event) => {
                            event.stopPropagation()
                            beginRename(document)
                          }}
                        >
                          {document.title}
                        </button>
                      )}
                      <p className={styles.meta}>
                        {document.topicCount} 个主题 · 最近更新于 {formatUpdatedAt(document.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={(event) => {
                        event.stopPropagation()
                        beginRename(document)
                      }}
                    >
                      重命名
                    </button>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDuplicate(document.id)
                      }}
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      className={`${styles.actionButton} ${styles.dangerButton}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDelete(document.id)
                      }}
                    >
                      删除
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}
