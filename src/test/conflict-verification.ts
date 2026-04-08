import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface ConflictVerificationEntry {
  layer: 'app' | 'e2e'
  scenario: string
  passed: boolean
  keyAssertions: Record<string, boolean>
  recommendedResolution: string | null
  userChoice: string | null
  finalPersistence: string
  forbiddenActionVisible: boolean | null
  screenshotPaths: string[]
  tracePath: string | null
  notes: string[]
}

export interface ConflictVerificationSummary {
  suite: string
  generatedAt: string
  total: number
  passed: number
  failed: number
  entries: ConflictVerificationEntry[]
}

export function writeConflictVerificationSummary(
  outputPath: string,
  suite: string,
  entries: ConflictVerificationEntry[],
): void {
  const resolvedPath = resolve(process.cwd(), outputPath)
  mkdirSync(dirname(resolvedPath), { recursive: true })

  const summary: ConflictVerificationSummary = {
    suite,
    generatedAt: new Date().toISOString(),
    total: entries.length,
    passed: entries.filter((entry) => entry.passed).length,
    failed: entries.filter((entry) => !entry.passed).length,
    entries,
  }

  writeFileSync(resolvedPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
}

export function sanitizeArtifactName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
