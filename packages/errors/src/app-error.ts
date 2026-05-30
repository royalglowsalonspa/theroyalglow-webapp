import { ERROR_CODES, type ErrorCode } from './codes'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly isOperational: boolean
  readonly retryable: boolean
  readonly details?: unknown

  constructor(params: {
    code: ErrorCode
    message: string
    statusCode: number
    isOperational?: boolean
    retryable?: boolean
    details?: unknown
    cause?: Error
  }) {
    super(params.message, { cause: params.cause })
    this.name = 'AppError'
    this.code = params.code
    this.statusCode = params.statusCode
    this.isOperational = params.isOperational ?? true
    this.retryable = params.retryable ?? false
    this.details = params.details
  }
}

export function notFound(message = 'Resource not found'): AppError {
  return new AppError({
    code: ERROR_CODES.NOT_FOUND,
    message,
    statusCode: 404,
  })
}

export function forbidden(message = 'Access denied'): AppError {
  return new AppError({
    code: ERROR_CODES.FORBIDDEN,
    message,
    statusCode: 403,
  })
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError({
    code: ERROR_CODES.VALIDATION_ERROR,
    message,
    statusCode: 400,
    details,
  })
}

export function conflict(code: ErrorCode, message: string): AppError {
  return new AppError({
    code,
    message,
    statusCode: 409,
  })
}

export function serviceUnavailable(service: string, cause?: Error): AppError {
  return new AppError({
    code: ERROR_CODES.UPSTREAM_ERROR,
    message: `Service unavailable: ${service}`,
    statusCode: 502,
    retryable: true,
    ...(cause !== undefined ? { cause } : {}),
  })
}
