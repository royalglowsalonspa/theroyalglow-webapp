/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : errors/index
 * Scope        : Error Handling
 *
 * Description  : Barrel export for the errors package. Exposes
 *                AppError class, factory functions, and error codes.
 *
 * Responsibilities :
 * - Re-export AppError class and factory helpers
 * - Re-export error codes registry and ErrorCode type
 *
 * Features / Functionality :
 * - Single entry point for all error utilities
 *
 * Tech Stack   : TypeScript
 * Layer        : Shared Package
 *
 * Dependencies : ./app-error, ./codes
 *
 * Notes        : None
 ************************************************************/
export {
  AppError,
  notFound,
  forbidden,
  badRequest,
  conflict,
  serviceUnavailable,
} from './app-error'
export { ERROR_CODES, type ErrorCode } from './codes'
