import { canTransition } from './charge-status';

describe('canTransition', () => {
  it.each([
    ['pending', 'succeeded', true],
    ['pending', 'failed', true],
    ['pending', 'pending', false],
    ['succeeded', 'failed', false],
    ['failed', 'succeeded', false],
    ['succeeded', 'succeeded', false],
  ] as const)('%s -> %s = %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});
