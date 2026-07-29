/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : AppError
 * Scope        : Error Handling
 *
 * Description  : Custom error class for structured, operational error
 *                handling across the entire application stack.
 *
 * Responsibilities :
 * - Define AppError with code, statusCode, retryable, details
 * - Provide factory functions for common HTTP error patterns
 * - Distinguish operational vs programmer errors
 *
 * Features / Functionality :
 * - notFound() — 404
 * - forbidden() — 403
 * - badRequest() — 400 with validation details
 * - conflict() — 409
 * - gone() — 410 for permanently retired endpoints
 * - serviceUnavailable() — 502 (retryable)
 *
 * Tech Stack   : TypeScript
 * Layer        : Shared Package
 *
 * Dependencies : ./codes
 *
 * Notes        :
 * - isOperational = true means safe to expose to client
 * - retryable hints upstream callers to retry
 ************************************************************/
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

// 410 Gone — the endpoint existed but has been permanently retired because the
// capability moved elsewhere. Never retryable: retrying can never succeed, so
// the message should tell the caller where the capability now lives.
export function gone(message: string): AppError {
  return new AppError({
    code: ERROR_CODES.ENDPOINT_GONE,
    message,
    statusCode: 410,
    retryable: false,
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
