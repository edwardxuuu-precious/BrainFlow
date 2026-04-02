import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

const DATABASE_NAMES = ['brainflow-documents-v1', 'brainflow-ai-v1']

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }

  if (typeof indexedDB !== 'undefined') {
    await Promise.all(DATABASE_NAMES.map((name) => deleteDatabase(name)))
  }
})

afterEach(() => {
  cleanup()
})
