type Task<T> = () => Promise<T>

export class MutationQueue {
  private readonly chains = new Map<string, Promise<unknown>>()

  enqueue<T>(key: string, task: Task<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(task)

    this.chains.set(
      key,
      next.finally(() => {
        if (this.chains.get(key) === next) {
          this.chains.delete(key)
        }
      }),
    )

    return next
  }
}

