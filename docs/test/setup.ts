import '@testing-library/jest-dom/vitest'
import fc from 'fast-check'

// Register testing-library/jest-dom matchers (toBeInTheDocument, toHaveClass,
// etc.) for the jsdom component tests in the docs package.
//
// Set the default fast-check run count globally so every property test in the
// docs package executes at least 100 iterations without repeating the option
// per test. Individual tests may still override `numRuns` locally when a
// property needs more coverage.
fc.configureGlobal({ numRuns: 100 })
