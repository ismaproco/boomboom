import type { SchedulerTaskStatus } from '../shared/types'
import { logError } from './logger'

export type { SchedulerTaskStatus } from '../shared/types'

export type ScheduledTask = {
  name: string
  intervalMs: number
  run: () => void | Promise<void>
  runImmediately?: boolean
}

export class IntervalScheduler {
  private timers: Array<ReturnType<typeof setInterval>> = []
  private readonly status = new Map<string, SchedulerTaskStatus>()

  constructor(private readonly tasks: ScheduledTask[]) {
    tasks.forEach((task) => {
      this.status.set(task.name, {
        name: task.name,
        intervalMs: task.intervalMs,
        running: false,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastError: null,
        skippedOverlaps: 0,
      })
    })
  }

  start() {
    this.tasks.forEach((task) => {
      if (task.runImmediately) void this.runTask(task)
      this.timers.push(setInterval(() => void this.runTask(task), task.intervalMs))
    })
  }

  stop() {
    this.timers.forEach((timer) => clearInterval(timer))
    this.timers = []
  }

  getStatus(): SchedulerTaskStatus[] {
    return [...this.status.values()]
  }

  private async runTask(task: ScheduledTask) {
    const entry = this.status.get(task.name)
    if (!entry) return
    if (entry.running) {
      entry.skippedOverlaps += 1
      return
    }
    entry.running = true
    entry.lastStartedAt = new Date().toISOString()
    try {
      await task.run()
      entry.lastError = null
    } catch (error) {
      entry.lastError = error instanceof Error ? error.message : String(error)
      logError(`Scheduled task "${task.name}" failed`, undefined, {
        err: error instanceof Error ? error.message : String(error),
      })
    } finally {
      entry.running = false
      entry.lastFinishedAt = new Date().toISOString()
    }
  }
}
