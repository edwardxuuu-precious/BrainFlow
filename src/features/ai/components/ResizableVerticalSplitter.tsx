import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ResizableVerticalSplitter.module.css'

interface ResizableVerticalSplitterProps {
  onResize: (newWidth: number) => void
  currentWidth: number
}

export function ResizableVerticalSplitter({ onResize, currentWidth }: ResizableVerticalSplitterProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(currentWidth)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const delta = e.clientX - startXRef.current
    const newWidth = Math.max(280, Math.min(480, startWidthRef.current - delta))
    onResize(newWidth)
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
    startXRef.current = e.clientX
    startWidthRef.current = currentWidth
    setIsDragging(true)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

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
