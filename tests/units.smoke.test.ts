import { describe, expect, it } from 'vitest';

// Proves the `node` Vitest project runs. Slice 1.1 replaces this with the real
// units/keypad/schema tests.
describe('scaffold node harness', () => {
  it('runs a trivial assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
