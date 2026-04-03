import { useEffect, useRef, useState } from 'react'
import styles from './ResizableSplitter.module.css'

interface ResizableSplitterProps {
  direction?: 'horizontal' | 'vertical'
  minSize?: number
  maxSize?: number
  defaultSize?: number
  onResize?: (size: number) => void
}

export function ResizableSplitter({
  direction = 'horizontal',
  minSize = 150,
  maxSize = 600,
  defaultSize = 300,
  onResize,
}: ResizableSplitterProps) {
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const startHeightRef = useRef(defaultSize)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startYRef.current - e.clientY
      const newHeight = Math.max(minSize, Math.min(maxSize, startHeightRef.current + deltaY))
      onResize?.(newHeight)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = direction === 'horizontal' ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, direction, minSize, maxSize, onResize])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    startYRef.current = e.clientY
    startHeightRef.current = containerRef.current?.parentElement?.clientHeight || defaultSize
    setIsDragging(true)
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.splitter} ${isDragging ? styles.dragging : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.handle} />
    </div>
  )
}
