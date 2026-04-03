import type { CSSProperties, SVGProps } from 'react'

export type IconName =
  | 'add'
  | 'archive'
  | 'attachment'
  | 'back'
  | 'chat'
  | 'check'
  | 'close'
  | 'copy'
  | 'delete'
  | 'document'
  | 'edit'
  | 'error'
  | 'export'
  | 'fitView'
  | 'history'
  | 'keyboard'
  | 'local'
  | 'lock'
  | 'loading'
  | 'minus'
  | 'note'
  | 'redo'
  | 'restore'
  | 'search'
  | 'send'
  | 'settings'
  | 'spark'
  | 'storage'
  | 'tree'
  | 'undo'
  | 'unlock'
  | 'warning'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: IconName
  size?: number
  strokeWidth?: number
}

const iconPaths: Record<IconName, string[]> = {
  add: ['M12 5v14', 'M5 12h14'],
  archive: ['M4 7h16l-1 12H5L4 7Z', 'M9 11h6', 'M9 4h6l1 3H8l1-3Z'],
  attachment: ['M9 7a5 5 0 0 1 10 0v10a3 3 0 0 1-6 0V9a1 1 0 0 1 2 0v8a1 1 0 0 0 2 0V7a3 3 0 0 0-6 0v10a5 5 0 0 0 10 0V9'],
  back: ['M15 18l-6-6 6-6', 'M9 12h10'],
  chat: ['M5 6h14v9H9l-4 4V6Z'],
  check: ['M5 13l4 4L19 7'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  copy: ['M9 9h9v11H9z', 'M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1'],
  delete: ['M5 7h14', 'M9 7V5h6v2', 'M10 11v6', 'M14 11v6', 'M7 7l1 12h8l1-12'],
  document: ['M8 3h6l5 5v13H8z', 'M14 3v5h5'],
  edit: ['M4 20h4l10-10-4-4L4 16v4', 'M12 6l4 4', 'M14 4l4 4'],
  error: ['M12 8v5', 'M12 16h.01', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M15 9l-6 6', 'M9 9l6 6'],
  export: ['M12 4v11', 'M8 8l4-4 4 4', 'M5 20h14'],
  fitView: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  history: ['M5 7v5h5', 'M6 12a7 7 0 1 0 2-5', 'M12 9v4l3 2'],
  keyboard: ['M4 7h16v10H4z', 'M7 10h1', 'M10 10h1', 'M13 10h1', 'M16 10h1', 'M7 13h8'],
  local: ['M7 9a5 5 0 0 1 10 0', 'M5 13a8 8 0 0 1 14 0', 'M12 17h.01'],
  lock: ['M7 11h10v9H7z', 'M9 11V8a3 3 0 1 1 6 0v3'],
  loading: ['M12 4a8 8 0 1 1-5.66 2.34', 'M12 2v3', 'M4 12H1'],
  minus: ['M5 12h14'],
  note: ['M7 4h10v16l-5-3-5 3z'],
  redo: ['M19 7v5h-5', 'M18 12a7 7 0 1 1-2-5', 'M12 9v4l-3 2'],
  restore: ['M12 4v4l3-3', 'M12 8 9 5', 'M7 10a6 6 0 1 0 2-2'],
  search: ['M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z', 'm20 20-3.5-3.5'],
  send: ['M4 12 20 4 13 20 11 13 4 12', 'M11 13 20 4'],
  settings: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M5.6 5.6l2.1 2.1', 'M16.3 16.3l2.1 2.1', 'M18.4 5.6l-2.1 2.1', 'M7.7 16.3l-2.1 2.1', 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z'],
  spark: ['M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15', 'M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14'],
  storage: ['M5 6c0-1.1 3.1-2 7-2s7 .9 7 2-3.1 2-7 2-7-.9-7-2Z', 'M5 6v6c0 1.1 3.1 2 7 2s7-.9 7-2V6', 'M5 12v6c0 1.1 3.1 2 7 2s7-.9 7-2v-6'],
  tree: ['M7 6h4v4H7z', 'M13 14h4v4h-4z', 'M7 14h4v4H7z', 'M11 8h3v3', 'M14 11v3', 'M14 11H9v3'],
  undo: ['M5 7v5h5', 'M6 12a7 7 0 1 1 2-5', 'M12 9v4l3 2'],
  unlock: ['M7 11h10v9H7z', 'M9 11V8a3 3 0 1 1 5.5 1.5'],
  warning: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 2 18a2 2 0 0 0 1.8 2.1h11.8a2 2 0 0 0 1.8-2.1l-2-14.1a2 2 0 0 0-1.8-1.9H12.1a2 2 0 0 0-1.8 1.9z'],
}

export function Icon({ name, size = 18, strokeWidth = 1.8, style, ...props }: IconProps) {
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
      {iconPaths[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}
