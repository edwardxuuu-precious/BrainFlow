import type { MindMapTheme } from './types'

export const defaultTheme: MindMapTheme = {
  id: 'cupertino-slate',
  name: 'Cupertino Slate',
  canvas: '#f9f9fb',
  surface: '#ffffff',
  panel: '#f2f4f6',
  text: '#2d3338',
  mutedText: '#596065',
  accent: '#545f6e',
  grid: 'rgba(172, 179, 184, 0.12)',
  branchPalette: ['#545f6e', '#6d7785', '#7f6e63', '#546f6b', '#6f6a81', '#8b7467'],
}

export function normalizeMindMapTheme(theme?: Partial<MindMapTheme> | null): MindMapTheme {
  return {
    ...defaultTheme,
    id: theme?.id ?? defaultTheme.id,
    name: theme?.name ?? defaultTheme.name,
  }
}
