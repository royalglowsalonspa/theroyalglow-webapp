/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 28-06-2026 & Updated - 28-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : security/index
 * Scope        : Business Logic — Security
 *
 * Description  : Barrel export for shared security utilities.
 *
 * Responsibilities :
 * - Re-export HMAC request signing / verification helpers
 *
 * Tech Stack   : TypeScript
 * Layer        : Business Logic
 *
 * Dependencies : ./request-signing
 *
 * Notes        : Pure crypto utilities (Web Crypto) — no I/O, no framework.
 ************************************************************/
export * from './request-signing'
