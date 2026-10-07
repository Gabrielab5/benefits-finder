import { describe, expect, it } from 'vitest';
import { authCodeRedirect } from './authRedirect';

const at = (u: string) => authCodeRedirect(new URL(u))?.toString() ?? null;

describe('authCodeRedirect', () => {
  it('sends a login code that landed on the home page to the callback', () => {
    expect(at('https://app.test/?code=abc')).toBe('https://app.test/auth/callback?code=abc');
  });
  it('sends a login code that landed on the login page to the callback', () => {
    expect(at('https://app.test/login?code=abc&x=1')).toBe('https://app.test/auth/callback?code=abc');
  });
  it('leaves the callback itself and normal pages alone', () => {
    expect(at('https://app.test/auth/callback?code=abc')).toBeNull();
    expect(at('https://app.test/wallet')).toBeNull();
  });
});
