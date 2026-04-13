import { MutationQueue } from './mutation-queue'

describe('MutationQueue', () => {
  test('single task executes and returns result', async () => {
    const queue = new MutationQueue()
    const result = await queue.enqueue('a', async () => 42)
    expect(result).toBe(42)
  })

  test('tasks with same key run sequentially', async () => {
    const queue = new MutationQueue()
    const order: number[] = []

    const p1 = queue.enqueue('key', async () => {
      await new Promise((r) => setTimeout(r, 50))
      order.push(1)
      return 1
    })

    const p2 = queue.enqueue('key', async () => {
      order.push(2)
      return 2
    })

    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2])
  })

  test('tasks with different keys run concurrently', async () => {
    const queue = new MutationQueue()
    const order: string[] = []

    const p1 = queue.enqueue('slow', async () => {
      await new Promise((r) => setTimeout(r, 50))
      order.push('slow')
    })

    const p2 = queue.enqueue('fast', async () => {
      order.push('fast')
    })

    await Promise.all([p1, p2])
    // fast should finish before slow since they run concurrently
    expect(order).toEqual(['fast', 'slow'])
  })

  test('failed task does not block next task in chain', async () => {
    const queue = new MutationQueue()

    const p1 = queue.enqueue('key', async () => {
      throw new Error('boom')
    })

    const p2 = queue.enqueue('key', async () => 'ok')

    await expect(p1).rejects.toThrow('boom')
    expect(await p2).toBe('ok')
  })

  test('chain is reusable after completion', async () => {
    const queue = new MutationQueue()
    const order: number[] = []

    await queue.enqueue('a', async () => { order.push(1) })
    // After first task completes, enqueue a second task on the same key
    await queue.enqueue('a', async () => { order.push(2) })

    expect(order).toEqual([1, 2])
  })
})
