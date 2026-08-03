import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('surfaces the engine error message for failed requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Title is required.' }), { status: 400, headers: { 'Content-Type': 'application/json' } })));
    await expect(api.save('pages/home', {}, '')).rejects.toThrow('Title is required.');
  });

  it('sends saves using the existing API contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await api.save('pages/home', { title: 'Welcome' }, 'Body');
    expect(fetchMock).toHaveBeenCalledWith('/api/content/pages/home', expect.objectContaining({ method: 'POST', body: JSON.stringify({ data: { title: 'Welcome' }, body: 'Body' }) }));
  });
});
