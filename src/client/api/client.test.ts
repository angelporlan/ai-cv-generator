import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, request } from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

describe('typed API client', () => {
  it('returns parsed JSON payloads and includes credentials', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ ok: true, value: 42 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(request('/api/example')).resolves.toEqual({ ok: true, value: 42 });
    expect(fetchMock).toHaveBeenCalledWith('/api/example', expect.objectContaining({
      credentials: 'include',
      method: 'GET'
    }));
  });

  it('serializes JSON request bodies', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await request('/api/example', { method: 'POST', body: { name: 'CV' } });
    expect(fetchMock).toHaveBeenCalledWith('/api/example', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CV' })
    }));
  });

  it('maps auth-required responses to ApiError', async () => {
    mockFetch(new Response(JSON.stringify({ ok: false, requiresAuth: true, error: 'Login required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(request('/api/private')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'auth_required',
      status: 401,
      message: 'Login required'
    });
  });

  it('maps subscription-required responses to ApiError', async () => {
    mockFetch(new Response(JSON.stringify({ ok: false, requiresSubscription: true, error: 'Upgrade required' }), {
      status: 402,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(request('/api/pro')).rejects.toMatchObject({
      code: 'subscription_required',
      status: 402,
      message: 'Upgrade required'
    });
  });

  it('maps network failures to ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(request('/api/example')).rejects.toBeInstanceOf(ApiError);
    await expect(request('/api/example')).rejects.toMatchObject({
      code: 'network_error',
      status: 0,
      message: 'offline'
    });
  });

  it('exposes the Google auth redirect URL and start helper', () => {
    const redirects: string[] = [];

    expect(api.getGoogleLoginUrl()).toBe('/auth/google');
    api.startGoogleLogin((url) => redirects.push(url));
    expect(redirects).toEqual(['/auth/google']);
  });

  it('sends authenticated workspace state to the auth state endpoint', async () => {
    const fetchMock = mockFetch(new Response(JSON.stringify({ ok: true, serverUpdatedAt: '2026-05-02T10:00:00.000Z' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(api.saveAuthState({ markdown: '# CV\n' }, '2026-05-02T09:59:00.000Z')).resolves.toEqual({
      ok: true,
      serverUpdatedAt: '2026-05-02T10:00:00.000Z'
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/state', expect.objectContaining({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: { markdown: '# CV\n' },
        clientUpdatedAt: '2026-05-02T09:59:00.000Z'
      })
    }));
  });

  it('falls back to the base template when an example file is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: 'CV content not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response('Base template content', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }));

    await expect(api.loadSourceWithFallback('cv-modern-example.md', 'cv-modern.md')).resolves.toEqual({
      content: 'Base template content',
      file: 'cv-modern.md',
      fallbackUsed: true
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/cv?file=cv-modern-example.md', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/cv?file=cv-modern.md', expect.any(Object));
  });
});
