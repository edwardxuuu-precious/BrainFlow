import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NetworkConstellation } from '../../components/illustrations/NetworkConstellation'
import { Button, SearchField, StatusPill, SurfacePanel, ToolbarGroup } from '../../components/ui'
import {
  documentService,
  getRecentDocumentId,
  setRecentDocumentId,
} from '../../features/documents/document-service'
import type { DocumentService, DocumentSummary, MindMapDocument } from '../../features/documents/types'
import styles from './HomePage.module.css'

interface HomePageProps {
  service?: DocumentService
}

const HOME_QUOTES: Array<{ text: string; author: string }> = [
  { text: '人须在事上磨，方立得住。', author: '王阳明' },
  { text: '未经省察的人生不值得过。', author: '苏格拉底' },
  { text: '与怪物战斗的人，应当小心自己不要成为怪物。', author: '尼采' },
  { text: '人性一个最特别的弱点，就是在意别人如何看待自己。', author: '叔本华' },
]

function buildRenamedDocument(document: MindMapDocument, title: string): MindMapDocument {
  return {
    ...document,
    title,
    updatedAt: Date.now(),
  }
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
  const [query, setQuery] = useState('')
  const [recentId, setRecentIdState] = useState<string | null>(() => getRecentDocumentId())
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [brandQuote] = useState(() => HOME_QUOTES[Math.floor(Math.random() * HOME_QUOTES.length)] ?? HOME_QUOTES[0])
  const deferredQuery = useDeferredValue(query)

  const recentDocument = useMemo(
    () => documents.find((document) => document.id === recentId) ?? documents[0] ?? null,
    [documents, recentId],
  )
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return documents
    }

    return documents.filter((document) => document.title.toLowerCase().includes(normalizedQuery))
  }, [deferredQuery, documents])

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

    await service.saveDocument(buildRenamedDocument(document, normalizedTitle))
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
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}>
          <span className={styles.wordmark}>BrainFlow</span>
          <div className={styles.brandQuote}>
            <span className={styles.brandQuoteText}>{brandQuote.text}</span>
            <span className={styles.brandQuoteAuthor}>{brandQuote.author}</span>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>

          <div className={styles.heroText}>
            <h1 className={styles.title}>你的思考，只属于你</h1>
            <p className={styles.subtitle}>BrainFlow 让发散的思维自然生长成结构。</p>
          </div>
          <ToolbarGroup className={styles.heroActions}>
            <Button tone="primary" size="lg" iconStart="add" onClick={handleCreate}>
              新建脑图
            </Button>
            {recentDocument ? (
              <Button
                tone="secondary"
                size="lg"
                iconStart="history"
                onClick={() => openDocument(recentDocument.id)}
              >
                继续最近文档
              </Button>
            ) : null}
          </ToolbarGroup>
        </div>
        <div className={styles.heroVisual}>
          <NetworkConstellation />
        </div>
      </section>

      <section className={styles.workspace}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.sectionLabel}>最近文档</p>
            <h2 className={styles.sectionTitle}>
              {loading ? '正在读取本地文档…' : `共 ${documents.length} 份脑图`}
            </h2>
            <p className={styles.sectionHint}>双击标题可编辑，点击整行即可进入编辑器。</p>
          </div>
          <SearchField
            aria-label="搜索文档"
            className={styles.searchField}
            placeholder="搜索文档..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <SurfacePanel frosted className={styles.list}>
          <div className={styles.tableHead}>
            <span>名称</span>
            <span>主题数</span>
            <span>最后修改</span>
            <span className={styles.actionHeading}>操作</span>
          </div>
          {loading ? (
            <div className={styles.emptyState}>正在读取本地文档…</div>
          ) : documents.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>还没有脑图</p>
              <p className={styles.emptyText}>先创建一份新文档，中心主题和两条一级分支会自动准备好。</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>没有匹配的文档</p>
              <p className={styles.emptyText}>试试其他关键词，或者直接创建新的脑图工作流。</p>
            </div>
          ) : (
            filteredDocuments.map((document) => {
              const isEditing = editingId === document.id
              const isRecent = recentDocument?.id === document.id

              return (
                <article
                  key={document.id}
                  className={styles.row}
                  onClick={() => openDocument(document.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openDocument(document.id)
                    }
                  }}
                  tabIndex={0}
                >
                  <div className={styles.rowMain}>
                    <span
                      className={styles.colorDot}
                      style={{ backgroundColor: document.previewColor, color: document.previewColor }}
                      aria-hidden="true"
                    />
                    <div className={styles.rowCopy}>
                      <div className={styles.rowTitleLine}>
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
                        {isRecent ? <StatusPill tone="accent">最近打开</StatusPill> : null}
                      </div>
                      <p className={styles.meta}>
                        {document.topicCount} 个主题 · 最近更新于 {formatUpdatedAt(document.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className={styles.rowMetric}>{document.topicCount}</div>
                  <div className={styles.rowMetric}>{formatUpdatedAt(document.updatedAt)}</div>

                  <div className={styles.rowActions}>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        beginRename(document)
                      }}
                    >
                      重命名
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDuplicate(document.id)
                      }}
                    >
                      复制
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      className={styles.deleteButton}
                      onClick={(event) => {
                        event.stopPropagation()
                        void handleDelete(document.id)
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </article>
              )
            })
          )}
        </SurfacePanel>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerSection}>
          <span className={styles.footerLabel}>本地模式</span>
          <span className={styles.footerValue}>自动保存 / 离线优先 / 无云依赖</span>
        </div>
        <div className={styles.footerSection}>
          <span className={styles.footerLabel}>本地存储</span>
          <span className={styles.footerValue}>IndexedDB / localStorage</span>
        </div>
        <div className={styles.footerSection}>
          <span className={styles.footerLabel}>工作区状态</span>
          <span className={styles.footerValue}>
            {loading ? '正在准备…' : `${documents.length} 份脑图 · Atelier Slate`}
          </span>
        </div>
      </footer>
    </main>
  )
}
