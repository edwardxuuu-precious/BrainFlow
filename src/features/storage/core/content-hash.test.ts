import { stableStringify, computeContentHash } from './content-hash'

describe('stableStringify', () => {
  test('objects with different key orders produce same string', () => {
    const a = { z: 1, a: 2, m: 3 }
    const b = { a: 2, m: 3, z: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  test('nested objects sorted recursively', () => {
    const a = { outer: { z: 1, a: 2 }, b: { y: 3, x: 4 } }
    const b = { b: { x: 4, y: 3 }, outer: { a: 2, z: 1 } }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  test('arrays preserved in order but nested objects sorted', () => {
    const a = [{ b: 1, a: 2 }, { d: 3, c: 4 }]
    const b = [{ a: 2, b: 1 }, { c: 4, d: 3 }]
    expect(stableStringify(a)).toBe(stableStringify(b))

    // Array order itself must be preserved
    const reversed = [{ d: 3, c: 4 }, { b: 1, a: 2 }]
    expect(stableStringify(a)).not.toBe(stableStringify(reversed))
  })

  test('primitives: string, number, boolean, null', () => {
    expect(stableStringify('hello')).toBe('"hello"')
    expect(stableStringify(42)).toBe('42')
    expect(stableStringify(true)).toBe('true')
    expect(stableStringify(null)).toBe('null')
  })
})

describe('computeContentHash', () => {
  test('returns sha256: prefix', async () => {
    const hash = await computeContentHash({ a: 1 })
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  test('same content produces same hash', async () => {
    const obj = { key: 'value', num: 123 }
    const hash1 = await computeContentHash(obj)
    const hash2 = await computeContentHash(obj)
    expect(hash1).toBe(hash2)
  })

  test('different key order produces same hash', async () => {
    const a = { x: 1, y: 2, z: 3 }
    const b = { z: 3, x: 1, y: 2 }
    const hashA = await computeContentHash(a)
    const hashB = await computeContentHash(b)
    expect(hashA).toBe(hashB)
  })

  test('different content produces different hash', async () => {
    const hashA = await computeContentHash({ a: 1 })
    const hashB = await computeContentHash({ a: 2 })
    expect(hashA).not.toBe(hashB)
  })
})
