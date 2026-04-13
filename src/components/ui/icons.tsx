import type { CSSProperties, ReactNode, SVGProps } from 'react'

export type IconName =
  | 'add'
  | 'ai'
  | 'archive'
  | 'attachment'
  | 'back'
  | 'chat'
  | 'check'
  | 'checkCircle'
  | 'calendar'
  | 'circle'
  | 'chevronDown'
  | 'chevronRight'
  | 'close'
  | 'copy'
  | 'delete'
  | 'document'
  | 'edit'
  | 'error'
  | 'export'
  | 'fitView'
  | 'history'
  | 'info'
  | 'keyboard'
  | 'local'
  | 'link'
  | 'lock'
  | 'loading'
  | 'minus'
  | 'note'
  | 'palette'
  | 'question'
  | 'redo'
  | 'restore'
  | 'search'
  | 'send'
  | 'settings'
  | 'spark'
  | 'sparkles'
  | 'star'
  | 'storage'
  | 'tag'
  | 'tree'
  | 'undo'
  | 'unlock'
  | 'warning'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: IconName
  size?: number
  strokeWidth?: number
}

interface IconRendererProps {
  size: number
  strokeWidth: number
}

type IconDefinition =
  | {
      paths: string[]
    }
  | {
      render: (props: IconRendererProps) => ReactNode
    }

const iconDefinitions: Record<IconName, IconDefinition> = {
  add: { paths: ['M12 5v14', 'M5 12h14'] },
  ai: {
    render: () => (
      <>
        <rect x="7" y="9" width="10" height="8" rx="2" />
        <path d="M9 9V7a3 3 0 0 1 6 0v2" />
        <circle cx="12" cy="13" r="2" fill="currentColor" stroke="none" fillOpacity="0.7" />
        <path d="M10 19l1-2h2l1 2" />
      </>
    ),
  },
  archive: { paths: ['M4 7h16l-1 12H5L4 7Z', 'M9 11h6', 'M9 4h6l1 3H8l1-3Z'] },
  attachment: { paths: ['M12 4v10a3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a5 5 0 0 0-10 0v10a7 7 0 0 0 7 7 7 7 0 0 0 7-7v-3'] },
  back: { paths: ['M15 18l-6-6 6-6', 'M9 12h10'] },
  chevronDown: { paths: ['M6 9l6 6 6-6'] },
  chevronRight: { paths: ['M9 6l6 6-6 6'] },
  chat: {
    render: () => (
      <>
        <path d="M6.5 7.25a2.75 2.75 0 0 1 2.75-2.75h8.5a2.75 2.75 0 0 1 2.75 2.75v6a2.75 2.75 0 0 1-2.75 2.75h-5l-3.5 3v-3h-1a2.75 2.75 0 0 1-2.75-2.75v-6Z" />
        <path d="M11.25 9.75h4.5" />
        <path d="M11.25 12.75h3.25" />
        <circle cx="8.75" cy="9.25" r="0.9" fill="currentColor" stroke="none" fillOpacity="0.88" />
      </>
    ),
  },
  calendar: { paths: ['M7 4v3', 'M17 4v3', 'M4 8h16', 'M5 6h14v13H5z', 'M8 11h3', 'M13 11h3', 'M8 15h3'] },
  circle: { paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'] },
  check: { paths: ['M5 13l4 4L19 7'] },
  checkCircle: { paths: ['M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z', 'M9 12l2 2 4-4'] },
  close: { paths: ['M6 6l12 12', 'M18 6L6 18'] },
  copy: { paths: ['M9 9h9v11H9z', 'M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1'] },
  delete: { paths: ['M5 7h14', 'M9 7V5h6v2', 'M10 11v6', 'M14 11v6', 'M7 7l1 12h8l1-12'] },
  document: { paths: ['M6 4h12v16H6z', 'M9 9h6', 'M9 13h6', 'M9 17h4'] },
  edit: { paths: ['M4 20h4l10-10-4-4L4 16v4', 'M12 6l4 4', 'M14 4l4 4'] },
  error: { paths: ['M12 8v5', 'M12 16h.01', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M15 9l-6 6', 'M9 9l6 6'] },
  export: { paths: ['M12 4v11', 'M8 8l4-4 4 4', 'M5 20h14'] },
  fitView: { paths: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'] },
  history: { paths: ['M5 7v5h5', 'M6 12a7 7 0 1 0 2-5', 'M12 9v4l3 2'] },
  info: { paths: ['M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z', 'M12 8v6', 'M12 17h.01'] },
  keyboard: { paths: ['M4 7h16v10H4z', 'M7 10h1', 'M10 10h1', 'M13 10h1', 'M16 10h1', 'M7 13h8'] },
  local: { paths: ['M7 9a5 5 0 0 1 10 0', 'M5 13a8 8 0 0 1 14 0', 'M12 17h.01'] },
  link: { paths: ['M10 14 14 10', 'M8.5 15.5 6 18a3 3 0 0 1-4-4l2.5-2.5a3 3 0 0 1 4 0', 'M15.5 8.5 18 6a3 3 0 1 0-4-4L11.5 4.5a3 3 0 0 0 0 4'] },
  lock: { paths: ['M7 11h10v9H7z', 'M9 11V8a3 3 0 1 1 6 0v3'] },
  loading: { paths: ['M12 4a8 8 0 1 1-5.66 2.34', 'M12 2v3', 'M4 12H1'] },
  minus: { paths: ['M5 12h14'] },
  note: {
    render: () => (
      <>
        <rect x="5.25" y="4.75" width="13.5" height="14.5" rx="3" />
        <path d="M8.5 9.25h7" />
        <path d="M8.5 12.25h7" />
        <path d="M8.5 15.25h4.5" />
        <rect x="6.75" y="8.25" width="0.9" height="7.75" rx="0.45" fill="currentColor" stroke="none" fillOpacity="0.86" />
      </>
    ),
  },
  palette: {
    render: () => (
      <>
        <path d="M12 2a10 10 0 1 0 0 20c1.5 0 2-1 2-2v-2c0-1-.5-2-2-2h-2c-.5 0-1-.5-1-1V8c0-3 3-6 3-6z" />
        <circle cx="7" cy="9.5" r="1.5" fill="currentColor" stroke="none" fillOpacity="0.86" />
        <circle cx="10.5" cy="6.5" r="1.25" fill="currentColor" stroke="none" fillOpacity="0.72" />
        <circle cx="16.5" cy="13.5" r="1.5" fill="currentColor" stroke="none" fillOpacity="0.86" />
      </>
    ),
  },
  question: { paths: ['M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4', 'M12 17h.01', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'] },
  redo: {
    render: () => (
      <>
        <path d="M15.25 7.25h3.5v3.5" />
        <path d="M18.75 10.75a6.75 6.75 0 1 1-2.55-5.27" />
      </>
    ),
  },
  restore: { paths: ['M12 4v4l3-3', 'M12 8 9 5', 'M7 10a6 6 0 1 0 2-2'] },
  search: { paths: ['M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm7 13-4-4'] },
  send: { paths: ['M4 12 20 4 13 20 11 13 4 12', 'M11 13 20 4'] },
  settings: { paths: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M5.6 5.6l2.1 2.1', 'M16.3 16.3l2.1 2.1', 'M18.4 5.6l-2.1 2.1', 'M7.7 16.3l-2.1 2.1', 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z'] },
  spark: { paths: ['M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15', 'M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14'] },
  sparkles: { paths: ['M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3'] },
  star: { paths: ['M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6l3-6z'] },
  storage: { paths: ['M5 6c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2Z', 'M5 6v6c0 1.1 3.1 2 7 2s7-.9 7-2V6', 'M5 12v6c0 1.1 3.1 2 7 2s7-.9 7-2v-6'] },
  tag: {
    render: () => (
      <>
        <path d="M12.5 2.5h-7a2 2 0 0 0-2 2v7l7.5 7.5 7.5-7.5v-7a2 2 0 0 0-2-2z" />
        <circle cx="7.75" cy="7.25" r="1.15" fill="currentColor" stroke="none" fillOpacity="0.86" />
      </>
    ),
  },
  tree: { paths: ['M7 6h4v4H7z', 'M13 14h4v4h-4z', 'M7 14h4v4H7z', 'M11 8h3v3', 'M14 11v3', 'M14 11H9v3'] },
  undo: {
    render: () => (
      <>
        <path d="M8.75 7.25h-3.5v3.5" />
        <path d="M5.25 10.75A6.75 6.75 0 1 0 7.8 5.48" />
      </>
    ),
  },
  unlock: { paths: ['M7 11h10v9H7z', 'M9 11V8a3 3 0 1 1 5.5 1.5'] },
  warning: { paths: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 2 18a2 2 0 0 0 1.8 2.1h11.8a2 2 0 0 0 1.8-2.1l-2-14.1a2 2 0 0 0-1.8-1.9H12.1a2 2 0 0 0-1.8 1.9z'] },
}

export function Icon({ name, size = 18, strokeWidth = 1.8, style, ...props }: IconProps) {
  const definition = iconDefinitions[name]

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={
        {
          flex: '0 0 auto',
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      {'render' in definition
        ? definition.render({ size, strokeWidth })
        : definition.paths.map((path) => <path key={path} d={path} />)}
    </svg>
  )
}
