import { describe, expect, it } from 'vitest';
import { formatElapsed } from './useDeployProgress';

describe('formatElapsed', () => {
  it('shows minutes and zero-padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(75)).toBe('1:15');
    expect(formatElapsed(1805)).toBe('30:05');
  });
});
