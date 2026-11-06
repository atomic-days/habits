import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  AuthError, ConflictError, NotFoundRepoError, RateLimitError, getFile, getRepo, listDir, putFile, updateFile,
  type DataRepo,
} from './github.ts';

const repo: DataRepo = { owner: 'o', repo: 'r', token: 'tok' };

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
const res = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('github client', () => {
  test('getFile decodes base64 split across lines and sends headers', async () => {
    const enc = b64('{"a":"Café"}\n');
    const split = enc.slice(0, 8) + '\n' + enc.slice(8);
    const f = vi.fn().mockResolvedValue(res(200, { content: split, sha: 's1' }));
    vi.stubGlobal('fetch', f);
    expect(await getFile(repo, 'data/x.json')).toEqual({ json: { a: 'Café' }, sha: 's1' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/contents/data/x.json');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  test('Café survives a put/get round trip', async () => {
    let sent: any;
    const f = vi.fn().mockImplementation(async (_u: string, init: any) => {
      if (init.method === 'PUT') {
        sent = JSON.parse(init.body);
        return res(200, { content: { sha: 'n1' } });
      }
      return res(200, { content: sent.content, sha: 'n1' });
    });
    vi.stubGlobal('fetch', f);
    await putFile(repo, 'data/x.json', { name: 'Café' }, null, 'm');
    expect(await getFile(repo, 'data/x.json')).toEqual({ json: { name: 'Café' }, sha: 'n1' });
  });

  test('404 gives null from getFile and [] from listDir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => res(404)));
    expect(await getFile(repo, 'p')).toBeNull();
    expect(await listDir(repo, 'p')).toEqual([]);
  });

  test('listDir maps entries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      res(200, [{ name: 'a.json', path: 'd/a.json', sha: 'x', type: 'file', size: 1 }])));
    expect(await listDir(repo, 'd')).toEqual([{ name: 'a.json', path: 'd/a.json', sha: 'x' }]);
  });

  test('getRepo resolves on 200 and throws NotFoundRepoError on 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(200)));
    await expect(getRepo(repo)).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(404)));
    await expect(getRepo(repo)).rejects.toBeInstanceOf(NotFoundRepoError);
  });

  test('putFile sends message, content and sha, returns new sha', async () => {
    const f = vi.fn().mockResolvedValue(res(200, { content: { sha: 'new' } }));
    vi.stubGlobal('fetch', f);
    expect(await putFile(repo, 'p.json', { a: 1 }, 'old', 'msg')).toBe('new');
    const init = f.mock.calls[0][1];
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect(body.message).toBe('msg');
    expect(body.sha).toBe('old');
    expect(atob(body.content)).toBe('{\n  "a": 1\n}\n');
  });

  test('putFile on 409 rejects with ConflictError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(409)));
    await expect(putFile(repo, 'p', {}, 's', 'm')).rejects.toBeInstanceOf(ConflictError);
  });

  test('putFile on 422 mentioning sha is a ConflictError, other 422 is not', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(422, { message: 'sha wasn\'t supplied' })));
    await expect(putFile(repo, 'p', {}, null, 'm')).rejects.toBeInstanceOf(ConflictError);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(422, { message: 'invalid request' })));
    await expect(putFile(repo, 'p', {}, null, 'm')).rejects.not.toBeInstanceOf(ConflictError);
  });

  test('a 403 with x-ratelimit-remaining 0 is a RateLimitError, not an AuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })));
    const err = await getFile(repo, 'p').catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err).not.toBeInstanceOf(AuthError);
    await expect(putFile(repo, 'p', {}, null, 'm')).rejects.toBeInstanceOf(RateLimitError);
  });

  test('a 403 with requests remaining is still an AuthError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '4999' } })));
    await expect(getFile(repo, 'p')).rejects.toBeInstanceOf(AuthError);
  });

  test.each([401, 403])('%i rejects with AuthError on every call', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => res(status)));
    await expect(getFile(repo, 'p')).rejects.toBeInstanceOf(AuthError);
    await expect(listDir(repo, 'p')).rejects.toBeInstanceOf(AuthError);
    await expect(getRepo(repo)).rejects.toBeInstanceOf(AuthError);
    await expect(putFile(repo, 'p', {}, null, 'm')).rejects.toBeInstanceOf(AuthError);
  });

  test('updateFile retries after a conflict without losing the other write', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200, { content: b64('{"a":1}'), sha: 's1' }))
      .mockResolvedValueOnce(res(409))
      .mockResolvedValueOnce(res(200, { content: b64('{"a":1,"b":2}'), sha: 's2' }))
      .mockResolvedValueOnce(res(200, { content: { sha: 's3' } }));
    vi.stubGlobal('fetch', f);
    const result = await updateFile(repo, 'data/x.json', {}, (j: any) => ({ ...j, c: 3 }), 'm');
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
    expect(JSON.parse(f.mock.calls[3][1].body).sha).toBe('s2');
  });

  test('updateFile starts from empty when the file is missing', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(200, { content: { sha: 'n' } }));
    vi.stubGlobal('fetch', f);
    expect(await updateFile(repo, 'p', { list: [] as number[] }, (j) => ({ list: [...j.list, 1] }), 'm'))
      .toEqual({ list: [1] });
    expect(JSON.parse(f.mock.calls[1][1].body).sha).toBeUndefined();
  });

  test('updateFile gives up after 3 attempts', async () => {
    const f = vi.fn().mockImplementation(async (_u: string, init: any) =>
      init?.method === 'PUT' ? res(409) : res(200, { content: b64('{}'), sha: 's' }));
    vi.stubGlobal('fetch', f);
    await expect(updateFile(repo, 'p', {}, (j) => j, 'm')).rejects.toBeInstanceOf(ConflictError);
    expect(f.mock.calls.filter((c) => c[1]?.method === 'PUT')).toHaveLength(3);
  });

  test('every request bypasses the HTTP cache', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(200, { content: b64('{}'), sha: 's' }))
      .mockResolvedValueOnce(res(200, { content: { sha: 'n' } }));
    vi.stubGlobal('fetch', f);
    await getFile(repo, 'p');
    await putFile(repo, 'p', {}, 's', 'm');
    for (const call of f.mock.calls) expect(call[1].cache).toBe('no-store');
  });
});
