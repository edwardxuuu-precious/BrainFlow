import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { StorageSaveIndicator } from '../../components/StorageSaveIndicator'
import { ToolbarGroup } from '../../components/ui'
import { normalizeDocumentTitle } from '../../features/documents/document-title'
import type { MindMapDocument } from '../../features/documents/types'
import { useEditorStore } from '../../features/editor/editor-store'
import { exportDocumentAsJson } from '../../features/editor/exporters'
import { useTextImportStore } from '../../features/import/text-import-store'
import type { RightPanelMode } from './map-editor-utils'
import { canUseHoverSubmenu, HOVER_SUBMENU_MEDIA_QUERY } from './map-editor-utils'
import styles from './MapEditorPage.module.css'
import revertIcon from '/revert.png'
import contentIcon from '/content.png'
import nodeIcon from '/node.png'
import symbolIcon from '/symbol.png'
import designIcon from '/design.png'
import agentsIcon from '/agents.png'

interface EditorTopbarProps {
  document: MindMapDocument
  isDirty: boolean
  rightSidebarOpen: boolean
  rightPanelMode: RightPanelMode
  onTopbarModeClick: (mode: RightPanelMode) => void
  onOpenTextImport: () => void
  onExportPng: () => Promise<void>
}

export function EditorTopbar({
  document,
  isDirty,
  rightSidebarOpen,
  rightPanelMode,
  onTopbarModeClick,
  onOpenTextImport,
  onExportPng,
}: EditorTopbarProps) {
  const navigate = useNavigate()

  const history = useEditorStore((state) => state.history)
  const future = useEditorStore((state) => state.future)
  const undo = useEditorStore((state) => state.undo)
  const redo = useEditorStore((state) => state.redo)
  const renameDocument = useEditorStore((state) => state.renameDocument)

  const textImportIsPreviewing = useTextImportStore((state) => state.isPreviewing)
  const textImportIsApplying = useTextImportStore((state) => state.isApplying)
  const textImportPreview = useTextImportStore((state) => state.preview)
  const textImportActiveJobType = useTextImportStore((state) => state.activeJobType)
  const textImportProgress = useTextImportStore((state) => state.progress)
  const textImportFileCount = useTextImportStore((state) => state.fileCount)
  const textImportCompletedFileCount = useTextImportStore((state) => state.completedFileCount)
  const textImportAppliedCount = useTextImportStore((state) => state.appliedCount)
  const textImportTotalOperations = useTextImportStore((state) => state.totalOperations)

  const [documentTitleDraft, setDocumentTitleDraft] = useState(document.title)
  const [isEditingDocumentTitle, setIsEditingDocumentTitle] = useState(false)
  const documentTitleInputRef = useRef<HTMLInputElement>(null)
  const skipDocumentTitleBlurRef = useRef(false)

  const [mainMenuOpen, setMainMenuOpen] = useState(false)
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false)
  const mainMenuRef = useRef<HTMLDivElement>(null)
  const mainMenuDropdownRef = useRef<HTMLDivElement>(null)
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)
  const [supportsHoverSubmenu, setSupportsHoverSubmenu] = useState(() => canUseHoverSubmenu())
  const isDesktop = true // topbar always shows full controls

  useEffect(() => {
    setPortalContainer(window.document.body)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(HOVER_SUBMENU_MEDIA_QUERY)
    const syncSupportsHoverSubmenu = () => {
      setSupportsHoverSubmenu(mediaQuery.matches)
    }

    syncSupportsHoverSubmenu()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncSupportsHoverSubmenu)
      return () => mediaQuery.removeEventListener('change', syncSupportsHoverSubmenu)
    }

    mediaQuery.addListener(syncSupportsHoverSubmenu)
    return () => mediaQuery.removeListener(syncSupportsHoverSubmenu)
  }, [])

  useEffect(() => {
    if (isEditingDocumentTitle) {
      return
    }

    setDocumentTitleDraft(document.title)
  }, [document.title, isEditingDocumentTitle])

  useEffect(() => {
    if (!isEditingDocumentTitle) {
      return
    }

    documentTitleInputRef.current?.focus()
    documentTitleInputRef.current?.select()
  }, [isEditingDocumentTitle])

  // Close main menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : null
      const clickedInsideTrigger =
        !!mainMenuRef.current &&
        (eventPath ? eventPath.includes(mainMenuRef.current) : mainMenuRef.current.contains(event.target as Node))
      const clickedInsideDropdown =
        !!mainMenuDropdownRef.current &&
        (eventPath
          ? eventPath.includes(mainMenuDropdownRef.current)
          : mainMenuDropdownRef.current.contains(event.target as Node))

      if (!clickedInsideTrigger && !clickedInsideDropdown) {
        closeMainMenu()
      }
    }

    if (mainMenuOpen) {
      window.document.addEventListener('mousedown', handleClickOutside)
      return () => window.document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [mainMenuOpen])

  useEffect(() => {
    if (!mainMenuOpen) {
      setExportSubmenuOpen(false)
    }
  }, [mainMenuOpen])

  const useHoverExportSubmenu = isDesktop && supportsHoverSubmenu

  const closeMainMenu = useCallback(() => {
    setExportSubmenuOpen(false)
    setMainMenuOpen(false)
  }, [])

  const handleMainMenuToggle = useCallback(() => {
    setExportSubmenuOpen(false)
    setMainMenuOpen((previous) => !previous)
  }, [])

  const handleExportMenuClick = useCallback(() => {
    if (useHoverExportSubmenu) {
      setExportSubmenuOpen(true)
      return
    }

    setExportSubmenuOpen((previous) => !previous)
  }, [useHoverExportSubmenu])

  const handleExportMenuPointerEnter = useCallback(() => {
    if (!useHoverExportSubmenu) {
      return
    }

    setExportSubmenuOpen(true)
  }, [useHoverExportSubmenu])

  const handleExportMenuPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!useHoverExportSubmenu) {
        return
      }

      const nextTarget = event.relatedTarget
      if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
        return
      }

      setExportSubmenuOpen(false)
    },
    [useHoverExportSubmenu],
  )

  const handleExportMenuBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    setExportSubmenuOpen(false)
  }, [])

  const handleExportMenuFocus = useCallback(() => {
    if (!useHoverExportSubmenu) {
      return
    }

    setExportSubmenuOpen(true)
  }, [useHoverExportSubmenu])

  const commitDocumentTitle = () => {
    renameDocument(normalizeDocumentTitle(documentTitleDraft))
    setIsEditingDocumentTitle(false)
  }

  const cancelDocumentTitleEditing = () => {
    setDocumentTitleDraft(document.title)
    setIsEditingDocumentTitle(false)
  }

  const startDocumentTitleEditing = () => {
    setDocumentTitleDraft(document.title)
    setIsEditingDocumentTitle(true)
  }

  const textImportButtonLabel = useMemo(() => {
    if (textImportIsPreviewing) {
      return textImportActiveJobType === 'batch'
        ? `智能导入 ${textImportCompletedFileCount}/${Math.max(1, textImportFileCount)}`
        : `智能导入 ${textImportProgress}%`
    }
    if (textImportIsApplying) {
      return `应用中 ${textImportAppliedCount}/${Math.max(1, textImportTotalOperations)}`
    }
    if (textImportPreview) {
      return textImportActiveJobType === 'batch'
        ? '智能导入（批次可应用）'
        : '智能导入（可应用）'
    }
    return '智能导入'
  }, [
    textImportIsPreviewing,
    textImportIsApplying,
    textImportPreview,
    textImportActiveJobType,
    textImportProgress,
    textImportFileCount,
    textImportCompletedFileCount,
    textImportAppliedCount,
    textImportTotalOperations,
  ])

  return (
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}>
        <div className={styles.mainMenuContainer} ref={mainMenuRef}>
          <button
            type="button"
            className={styles.hamburgerButton}
            onClick={handleMainMenuToggle}
            aria-expanded={mainMenuOpen}
            aria-label="打开菜单"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          {mainMenuOpen && portalContainer && (
            createPortal(
              <div
                ref={mainMenuDropdownRef}
                className={styles.mainMenuDropdown}
                style={{ position: 'fixed', top: '48px', left: '12px', zIndex: 100000 }}
              >
                <div
                  className={styles.menuItemWithSubmenu}
                  onPointerEnter={handleExportMenuPointerEnter}
                  onPointerLeave={handleExportMenuPointerLeave}
                  onFocus={handleExportMenuFocus}
                  onBlur={handleExportMenuBlur}
                >
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={handleExportMenuClick}
                    aria-expanded={exportSubmenuOpen}
                    aria-haspopup="menu"
                  >
                    <span>导出</span>
                    <svg
                      className={`${styles.submenuArrow} ${exportSubmenuOpen ? styles.submenuArrowOpen : ''}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path d="M4.5 2L8 6L4.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  {exportSubmenuOpen && (
                    <div className={styles.submenu} role="menu" aria-label="导出格式">
                      <button
                        type="button"
                        className={styles.submenuItem}
                        role="menuitem"
                        onClick={() => {
                          exportDocumentAsJson(document)
                          closeMainMenu()
                        }}
                      >
                        导出 JSON
                      </button>
                      <button
                        type="button"
                        className={styles.submenuItem}
                        role="menuitem"
                        onClick={() => {
                          void onExportPng()
                          closeMainMenu()
                        }}
                      >
                        导出 PNG
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    closeMainMenu()
                    navigate('/ai-settings')
                  }}
                >
                  AI 服务
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    closeMainMenu()
                    navigate('/settings')
                  }}
                >
                  数据存储与同步
                </button>
              </div>,
              portalContainer
            )
          )}
        </div>
        <button type="button" className={styles.brandBlock} onClick={() => navigate('/')}>
          <span className={styles.wordmark}>FLOW</span>
        </button>
        <div className={styles.titleWrap}>
          {isEditingDocumentTitle ? (
            <input
              ref={documentTitleInputRef}
              className={styles.titleInput}
              value={documentTitleDraft}
              maxLength={50}
              aria-label="编辑画布名称"
              onBlur={() => {
                if (skipDocumentTitleBlurRef.current) {
                  skipDocumentTitleBlurRef.current = false
                  return
                }

                commitDocumentTitle()
              }}
              onChange={(event) => setDocumentTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  skipDocumentTitleBlurRef.current = true
                  commitDocumentTitle()
                }

                if (event.key === 'Escape') {
                  event.preventDefault()
                  skipDocumentTitleBlurRef.current = true
                  cancelDocumentTitleEditing()
                }
              }}
            />
          ) : (
            <div
              role="button"
              tabIndex={0}
              className={styles.titleDisplay}
              aria-label={`画布名称：${document.title}`}
              onDoubleClick={startDocumentTitleEditing}
              onKeyDown={(event) => {
                if (event.key === 'F2' || event.key === 'Enter') {
                  event.preventDefault()
                  startDocumentTitleEditing()
                }
              }}
            >
              {document.title}
            </div>
          )}
          <StorageSaveIndicator isDirty={isDirty} />
        </div>
      </div>
      <ToolbarGroup className={styles.topbarRight}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={undo}
          disabled={history.length === 0}
          aria-label="撤销"
        >
          <img src={revertIcon} alt="撤销" style={{ width: 16, height: 16, display: 'block' }} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={redo}
          disabled={future.length === 0}
          aria-label="重做"
        >
          <img src={revertIcon} alt="重做" style={{ width: 16, height: 16, display: 'block', transform: 'scaleX(-1)' }} />
        </button>
        <button
          type="button"
          className={styles.topbarToolButton}
          data-active={rightSidebarOpen && rightPanelMode === 'outline'}
          onClick={() => onTopbarModeClick('outline')}
        >
          <img src={contentIcon} alt="目录" style={{ width: 20, height: 20, display: 'block' }} />
          <span>目录</span>
        </button>
        <button
          type="button"
          className={styles.topbarToolButton}
          data-active={rightSidebarOpen && rightPanelMode === 'details'}
          onClick={() => onTopbarModeClick('details')}
        >
          <img src={nodeIcon} alt="节点" style={{ width: 20, height: 20, display: 'block' }} />
          <span>节点</span>
        </button>
        <button
          type="button"
          className={styles.topbarToolButton}
          data-active={rightSidebarOpen && rightPanelMode === 'markers'}
          onClick={() => onTopbarModeClick('markers')}
        >
          <img src={symbolIcon} alt="标记" style={{ width: 20, height: 20, display: 'block' }} />
          <span>标记</span>
        </button>
        <button
          type="button"
          className={styles.topbarToolButton}
          data-active={rightSidebarOpen && rightPanelMode === 'format'}
          onClick={() => onTopbarModeClick('format')}
        >
          <img src={designIcon} alt="格式" style={{ width: 20, height: 20, display: 'block' }} />
          <span>格式</span>
        </button>
        <button
          type="button"
          className={styles.topbarToolButton}
          data-active={rightSidebarOpen && rightPanelMode === 'ai'}
          onClick={() => onTopbarModeClick('ai')}
        >
          <img src={agentsIcon} alt="AI" style={{ width: 20, height: 20, display: 'block' }} />
          <span>AI</span>
        </button>
        <button
          type="button"
          className={styles.exportButtonPrimary}
          onClick={onOpenTextImport}
        >
          {textImportButtonLabel}
        </button>
      </ToolbarGroup>
    </header>
  )
}
