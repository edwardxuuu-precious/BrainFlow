// @vitest-environment node

import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  API_HEALTHCHECK_INITIAL_DELAY_MS,
  API_HEALTHCHECK_INTERVAL_MS,
  API_RESTART_BASE_DELAY_MS,
  buildChildCommandSpec,
  DevSupervisor,
} from './dev-supervisor.js'

class FakeChildProcess extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid: number

  constructor(pid: number) {
    super()
    this.pid = pid
  }

  kill(): boolean {
    this.emit('exit', null, 'SIGTERM')
    this.emit('close', null, 'SIGTERM')
    return true
  }
}

function createChild(pid: number): ChildProcessWithoutNullStreams {
  return new FakeChildProcess(pid) as unknown as ChildProcessWithoutNullStreams
}

describe('DevSupervisor', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('builds Windows child commands through cmd.exe instead of pnpm.cmd', () => {
    const spec = buildChildCommandSpec('win32', 'dev:web-only', 'C:\\repo', { TEST: '1' })

    expect(spec.command).toBe('cmd.exe')
    expect(spec.args).toEqual(['/d', '/s', '/c', 'pnpm dev:web-only'])
    expect(spec.options.detached).toBe(false)
    expect(spec.label).toBe('cmd.exe /d /s /c "pnpm dev:web-only"')
  })

  it('builds non-Windows child commands directly with pnpm', () => {
    const spec = buildChildCommandSpec('linux', 'dev:server', '/repo', { TEST: '1' })

    expect(spec.command).toBe('pnpm')
    expect(spec.args).toEqual(['dev:server'])
    expect(spec.options.detached).toBe(true)
    expect(spec.label).toBe('pnpm dev:server')
  })

  it('restarts api without shutting down web when the bridge process exits', async () => {
    vi.useFakeTimers()

    const webChild = createChild(101)
    const apiChildFirst = createChild(202)
    const apiChildSecond = createChild(203)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(webChild)
      .mockReturnValueOnce(apiChildFirst)
      .mockReturnValueOnce(apiChildSecond)
    const exitProcess = vi.fn()

    const supervisor = new DevSupervisor({
      spawnProcess,
      terminateProcess: vi.fn(async () => undefined),
      exitProcess,
      platform: 'win32',
      fetchStatus: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    })

    supervisor.start()
    ;(apiChildFirst as unknown as FakeChildProcess).emit('exit', 1, null)

    await vi.advanceTimersByTimeAsync(API_RESTART_BASE_DELAY_MS)

    expect(spawnProcess).toHaveBeenCalledTimes(3)
    expect(spawnProcess.mock.calls[2]?.[0]).toBe('cmd.exe')
    expect(spawnProcess.mock.calls[2]?.[1]).toEqual(['/d', '/s', '/c', 'pnpm dev:server'])
    expect(exitProcess).not.toHaveBeenCalled()
  })

  it('backs off api restarts after repeated rapid crashes', async () => {
    vi.useFakeTimers()

    const webChild = createChild(111)
    const apiChildFirst = createChild(222)
    const apiChildSecond = createChild(223)
    const apiChildThird = createChild(224)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(webChild)
      .mockReturnValueOnce(apiChildFirst)
      .mockReturnValueOnce(apiChildSecond)
      .mockReturnValueOnce(apiChildThird)

    const supervisor = new DevSupervisor({
      spawnProcess,
      terminateProcess: vi.fn(async () => undefined),
      exitProcess: vi.fn(),
      platform: 'win32',
      fetchStatus: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    })

    supervisor.start()
    ;(apiChildFirst as unknown as FakeChildProcess).emit('exit', 1, null)
    await vi.advanceTimersByTimeAsync(API_RESTART_BASE_DELAY_MS)

    ;(apiChildSecond as unknown as FakeChildProcess).emit('exit', 1, null)
    await vi.advanceTimersByTimeAsync(API_RESTART_BASE_DELAY_MS)

    expect(spawnProcess).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(API_RESTART_BASE_DELAY_MS)

    expect(spawnProcess).toHaveBeenCalledTimes(4)
    expect(spawnProcess.mock.calls[3]?.[0]).toBe('cmd.exe')
    expect(spawnProcess.mock.calls[3]?.[1]).toEqual(['/d', '/s', '/c', 'pnpm dev:server'])
  })

  it('restarts api when the health check fails twice in a row', async () => {
    vi.useFakeTimers()

    const webChild = createChild(301)
    const apiChildFirst = createChild(302)
    const apiChildSecond = createChild(303)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(webChild)
      .mockReturnValueOnce(apiChildFirst)
      .mockReturnValueOnce(apiChildSecond)
    const terminateProcess = vi.fn(async () => undefined)
    const fetchStatus = vi
      .fn()
      .mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

    const supervisor = new DevSupervisor({
      spawnProcess,
      terminateProcess,
      exitProcess: vi.fn(),
      platform: 'win32',
      fetchStatus,
    })

    supervisor.start()

    await vi.advanceTimersByTimeAsync(API_HEALTHCHECK_INITIAL_DELAY_MS)
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    expect(spawnProcess).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(API_HEALTHCHECK_INTERVAL_MS)
    expect(fetchStatus).toHaveBeenCalledTimes(2)
    expect(terminateProcess).toHaveBeenCalledWith(apiChildFirst)

    await vi.advanceTimersByTimeAsync(API_RESTART_BASE_DELAY_MS)
    expect(spawnProcess).toHaveBeenCalledTimes(3)
  })

  it('does not restart api when health checks return 200 even if ready is false', async () => {
    vi.useFakeTimers()

    const webChild = createChild(401)
    const apiChild = createChild(402)
    const spawnProcess = vi.fn().mockReturnValueOnce(webChild).mockReturnValueOnce(apiChild)
    const fetchStatus = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ready: false,
          issues: [{ code: 'verification_required', message: '需要重新验证。' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const supervisor = new DevSupervisor({
      spawnProcess,
      terminateProcess: vi.fn(async () => undefined),
      exitProcess: vi.fn(),
      platform: 'win32',
      fetchStatus,
    })

    supervisor.start()

    await vi.advanceTimersByTimeAsync(API_HEALTHCHECK_INITIAL_DELAY_MS + API_HEALTHCHECK_INTERVAL_MS)

    expect(fetchStatus).toHaveBeenCalledTimes(2)
    expect(spawnProcess).toHaveBeenCalledTimes(2)
  })

  it('shuts down the whole supervisor when web exits and cleans up api', async () => {
    const webChild = createChild(121)
    const apiChild = createChild(242)
    const spawnProcess = vi.fn().mockReturnValueOnce(webChild).mockReturnValueOnce(apiChild)
    const terminateProcess = vi.fn(async () => undefined)
    const exitProcess = vi.fn()

    const supervisor = new DevSupervisor({
      spawnProcess,
      terminateProcess,
      exitProcess,
      platform: 'win32',
      fetchStatus: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    })

    supervisor.start()
    ;(webChild as unknown as FakeChildProcess).emit('exit', 1, null)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(terminateProcess).toHaveBeenCalledTimes(1)
    expect(terminateProcess).toHaveBeenCalledWith(apiChild)
    expect(exitProcess).toHaveBeenCalledWith(1)
  })

  it('exits cleanly when web fails to start synchronously', async () => {
    const spawnProcess = vi.fn().mockImplementation(() => {
      throw new Error('spawn EINVAL')
    })
    const exitProcess = vi.fn()
    const error = vi.fn()

    const supervisor = new DevSupervisor({
      spawnProcess,
      terminateProcess: vi.fn(async () => undefined),
      exitProcess,
      error,
      platform: 'win32',
      fetchStatus: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    })

    supervisor.start()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(error).toHaveBeenCalledWith('[web] failed to start: spawn EINVAL')
    expect(exitProcess).toHaveBeenCalledWith(1)
  })

  it('retries api startup when spawn throws synchronously', async () => {
    vi.useFakeTimers()

    const webChild = createChild(501)
    const apiChild = createChild(502)
    const spawnProcess = vi
      .fn()
      .mockReturnValueOnce(webChild)
      .mockImplementationOnce(() => {
        throw new Error('spawn EINVAL')
      })
      .mockReturnValueOnce(apiChild)

    const supervisor = new DevSupervisor({
      spawnProcess,
      terminateProcess: vi.fn(async () => undefined),
      exitProcess: vi.fn(),
      platform: 'win32',
      fetchStatus: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    })

    supervisor.start()
    await vi.advanceTimersByTimeAsync(API_RESTART_BASE_DELAY_MS)

    expect(spawnProcess).toHaveBeenCalledTimes(3)
    expect(spawnProcess.mock.calls[2]?.[0]).toBe('cmd.exe')
  })
})
