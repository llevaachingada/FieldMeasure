// jsdom setup for component tests (vitest `jsdom` project).
//
// Intentionally empty: `@testing-library/jest-dom`-style matchers are NOT added
// (implementation plan slice 0.1 step 9 / appendix) — tests use plain assertions
// to keep the closed dev-dep list small. If a global setup is ever needed, add it
// here rather than in individual specs.
export {};
