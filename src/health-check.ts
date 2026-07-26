import path from 'path'
import fs from 'fs'
import { HealthStatus } from './types'
import { logger } from './utils/logger'

const HEALTH_FILE = path.join(process.cwd(), 'data', 'health.json')

export function loadHealth(): HealthStatus {
  try {
    if (fs.existsSync(HEALTH_FILE)) {
      return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf-8'))
    }
  } catch (err) {
    logger.warn('Failed to load health file, starting fresh')
  }
  return {
    lastRun: null,
    lastSuccess: null,
    lastError: null,
    consecutiveFailures: 0,
    totalPosts: 0,
    totalErrors: 0,
  }
}

export function saveHealth(status: HealthStatus): void {
  const dir = path.dirname(HEALTH_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(HEALTH_FILE, JSON.stringify(status, null, 2))
}

export function recordSuccess(status: HealthStatus): HealthStatus {
  return {
    ...status,
    lastRun: new Date().toISOString(),
    lastSuccess: new Date().toISOString(),
    lastError: null,
    consecutiveFailures: 0,
    totalPosts: status.totalPosts + 1,
  }
}

export function recordError(status: HealthStatus, error: string): HealthStatus {
  return {
    ...status,
    lastRun: new Date().toISOString(),
    lastError: error,
    consecutiveFailures: status.consecutiveFailures + 1,
    totalErrors: status.totalErrors + 1,
  }
}

export function isHealthy(status: HealthStatus): boolean {
  return status.consecutiveFailures < 5
}

export function shouldSkipRun(status: HealthStatus, intervalHours: number): boolean {
  if (!status.lastRun) return false
  const hoursSinceLastRun = (Date.now() - new Date(status.lastRun).getTime()) / (1000 * 60 * 60)
  return hoursSinceLastRun < intervalHours * 0.5
}
