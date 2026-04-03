import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ResizableSplitter.module.css'

interface ResizableSplitterProps {
  onResize: (delta: number) => void
}

export function ResizableSplitter({ onResize }: ResizableSplitterProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const startHeightRef = useRef(0)
  const deltaRef = useRef(0)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const delta = startYRef.current - e.clientY
    deltaRef.current = delta
    // 实时更新，使用 requestAnimationFrame 优化性能
    requestAnimationFrame(() => {
      onResize(startHeightRef.current + delta)
    })
  }, [isDragging, onResize])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startYRef.current = e.clientY
    startHeightRef.current = 0 // 相对位移模式
    deltaRef.current = 0
    setIsDragging(true)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // 清理
  useEffect(() => {
    return () => {
      if (isDragging) {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  return (
    <div
      className={`${styles.splitter} ${isDragging ? styles.dragging : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.handle} />
    </div>
  )
}
