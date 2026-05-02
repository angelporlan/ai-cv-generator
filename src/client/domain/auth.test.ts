import { describe, expect, it } from 'vitest';
import { getGoogleAuthNotice, getGoogleLoginUrl, parseGoogleAuthResult } from './auth';

describe('auth domain', () => {
  it('parses Google auth callbacks from search params', () => {
    expect(parseGoogleAuthResult('?auth=google_success')).toBe('success');
    expect(parseGoogleAuthResult('?auth=google_error')).toBe('error');
    expect(parseGoogleAuthResult('?auth=other')).toBeNull();
  });

  it('returns readable notices for Google auth results', () => {
    expect(getGoogleAuthNotice('success')).toContain('Google');
    expect(getGoogleAuthNotice('error')).toContain('Google');
    expect(getGoogleAuthNotice(null)).toBe('');
  });

  it('returns the Google login entrypoint', () => {
    expect(getGoogleLoginUrl()).toBe('/auth/google');
  });
});
