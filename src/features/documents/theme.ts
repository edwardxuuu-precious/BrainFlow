import type { MindMapTheme } from './types'

export const mindMapThemePresets: MindMapTheme[] = [
  {
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
  },
  {
    id: 'ocean-bloom',
    name: 'Ocean Bloom',
    canvas: '#f4fbff',
    surface: '#ffffff',
    panel: '#ebf4fb',
    text: '#253744',
    mutedText: '#5a7384',
    accent: '#2f7ea7',
    grid: 'rgba(101, 160, 196, 0.14)',
    branchPalette: ['#2f7ea7', '#3fa6c5', '#6fc4d4', '#76c8b7', '#5e95d9', '#7f83d9'],
  },
  {
    id: 'sunrise-coral',
    name: 'Sunrise Coral',
    canvas: '#fff8f4',
    surface: '#fffdfb',
    panel: '#fff0e8',
    text: '#4a332d',
    mutedText: '#8a675d',
    accent: '#e06d53',
    grid: 'rgba(224, 109, 83, 0.14)',
    branchPalette: ['#e06d53', '#f29a61', '#f0b74f', '#d8a23b', '#a97b5d', '#e17f8f'],
  },
  {
    id: 'forest-moss',
    name: 'Forest Moss',
    canvas: '#f6faf7',
    surface: '#ffffff',
    panel: '#edf5ef',
    text: '#26372e',
    mutedText: '#5d7264',
    accent: '#4d8067',
    grid: 'rgba(77, 128, 103, 0.14)',
    branchPalette: ['#4d8067', '#6aa786', '#87b87d', '#5e9c95', '#7c9172', '#a3b372'],
  },
  {
    id: 'violet-haze',
    name: 'Violet Haze',
    canvas: '#faf7ff',
    surface: '#ffffff',
    panel: '#f1ecfb',
    text: '#332f45',
    mutedText: '#6d6784',
    accent: '#7a6bc2',
    grid: 'rgba(122, 107, 194, 0.14)',
    branchPalette: ['#7a6bc2', '#9b7edb', '#c487dd', '#7aa0e6', '#7f8de0', '#b683c4'],
  },
  {
    id: 'graphite-neon',
    name: 'Graphite Neon',
    canvas: '#f3f5f8',
    surface: '#fcfdff',
    panel: '#e9edf4',
    text: '#1f2733',
    mutedText: '#5c6979',
    accent: '#3a8bff',
    grid: 'rgba(58, 139, 255, 0.14)',
    branchPalette: ['#3a8bff', '#44c2ff', '#7a9cff', '#40c9b2', '#8c7dff', '#ff8a5b'],
  },
]

export const defaultTheme: MindMapTheme = mindMapThemePresets[0]

function normalizeBranchPalette(theme?: Partial<MindMapTheme> | null): string[] {
  const fallback = defaultTheme.branchPalette
  const values = Array.isArray(theme?.branchPalette) ? theme.branchPalette.filter(Boolean) : []

  return fallback.map((color, index) => values[index] ?? color)
}

export function getMindMapThemePreset(themeId: string): MindMapTheme | null {
  const preset = mindMapThemePresets.find((candidate) => candidate.id === themeId)
  return preset ? structuredClone(preset) : null
}

export function normalizeMindMapTheme(theme?: Partial<MindMapTheme> | null): MindMapTheme {
  const preset = theme?.id ? getMindMapThemePreset(theme.id) : null
  const base = preset ?? defaultTheme

  return {
    ...base,
    ...theme,
    id: theme?.id ?? base.id,
    name: theme?.name ?? base.name,
    branchPalette: normalizeBranchPalette(theme ?? base),
  }
}

export function updateMindMapTheme(
  current: MindMapTheme,
  patch: Partial<MindMapTheme>,
): MindMapTheme {
  const nextTheme = normalizeMindMapTheme({
    ...current,
    ...patch,
    branchPalette: patch.branchPalette ?? current.branchPalette,
  })

  const mutatedVisualFields =
    'canvas' in patch ||
    'surface' in patch ||
    'panel' in patch ||
    'text' in patch ||
    'mutedText' in patch ||
    'accent' in patch ||
    'grid' in patch ||
    'branchPalette' in patch

  if (mutatedVisualFields && !('id' in patch) && !('name' in patch)) {
    return {
      ...nextTheme,
      id: 'custom',
      name: 'Custom',
    }
  }

  return nextTheme
}
