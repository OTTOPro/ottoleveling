import { describe, it, expect } from 'vitest';
import { timingSafeEqual } from '../../src/lib/auth';

describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqual('hello-world', 'hello-world')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(timingSafeEqual('hello-world', 'helloXworld')).toBe(false);
  });

  it('returns false for strings of different length', () => {
    expect(timingSafeEqual('short', 'much-longer-string')).toBe(false);
  });

  it('returns true for empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('returns false when one side is empty', () => {
    expect(timingSafeEqual('', 'x')).toBe(false);
  });

  it('handles 32-hex-char dev token shape', () => {
    const a = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const b = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const c = 'a1b2c3d4e5f60718293a4b5c6d7e8f91';
    expect(timingSafeEqual(a, b)).toBe(true);
    expect(timingSafeEqual(a, c)).toBe(false);
  });
});
