import 'vitest'

declare module 'vitest' {
  // Vitest 5 no longer inherits jest.Matchers from @types/jest-axe.
  interface Matchers<R, T> {
    toHaveNoViolations(): R
  }
}
