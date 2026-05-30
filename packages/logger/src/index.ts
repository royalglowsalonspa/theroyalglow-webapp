export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  level: LogLevel
  message: string
  service: string
  environment: string
  timestamp: string
  data?: Record<string, unknown>
}

export interface LoggerConfig {
  service: string
  environment: string
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  fatal(message: string, data?: Record<string, unknown>): void
}

function createLogMethod(
  level: LogLevel,
  config: LoggerConfig,
): (message: string, data?: Record<string, unknown>) => void {
  return (message: string, data?: Record<string, unknown>): void => {
    const entry: LogEntry = {
      level,
      message,
      service: config.service,
      environment: config.environment,
      timestamp: new Date().toISOString(),
    }

    if (data !== undefined) {
      entry.data = data
    }

    console.log(JSON.stringify(entry))
  }
}

export function createLogger(config: LoggerConfig): Logger {
  return {
    debug: createLogMethod('debug', config),
    info: createLogMethod('info', config),
    warn: createLogMethod('warn', config),
    error: createLogMethod('error', config),
    fatal: createLogMethod('fatal', config),
  }
}
