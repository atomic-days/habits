export interface DataRepo { owner: string; repo: string; token: string }

export class AuthError extends Error {}
export class ConflictError extends Error {}
export class NotFoundRepoError extends Error {}

const API = 'https://api.github.com';

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function decodeBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function request(r: DataRepo, suffix: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}/repos/${r.owner}/${r.repo}${suffix}`, {
    ...init,
    // GitHub sends max-age=60 on contents GETs. A retry after a 409 must not re-read a cached sha.
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${r.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(`GitHub rejected the token (${res.status})`);
  }
  return res;
}

async function fail(res: Response, what: string): Promise<never> {
  throw new Error(`${what} failed with ${res.status}`);
}

export async function getRepo(r: DataRepo): Promise<void> {
  const res = await request(r, '');
  if (res.status === 404) throw new NotFoundRepoError(`Repo ${r.owner}/${r.repo} not found`);
  if (!res.ok) await fail(res, 'getRepo');
}

export async function getFile<T>(r: DataRepo, path: string): Promise<{ json: T; sha: string } | null> {
  const res = await request(r, `/contents/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) await fail(res, `getFile ${path}`);
  const body = await res.json();
  return { json: JSON.parse(decodeBase64(body.content)) as T, sha: body.sha };
}

export async function putFile(
  r: DataRepo, path: string, json: unknown, sha: string | null, message: string,
): Promise<string> {
  const payload: Record<string, string> = {
    message,
    content: encodeBase64(JSON.stringify(json, null, 2) + '\n'),
  };
  if (sha) payload.sha = sha;
  const res = await request(r, `/contents/${path}`, { method: 'PUT', body: JSON.stringify(payload) });
  if (res.status === 409) throw new ConflictError(`${path} changed`);
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    if (/sha/i.test(String(body?.message ?? ''))) throw new ConflictError(`${path} changed`);
    throw new Error(`putFile ${path} failed with 422`);
  }
  if (!res.ok) await fail(res, `putFile ${path}`);
  const body = await res.json();
  return body.content.sha as string;
}

export async function listDir(r: DataRepo, path: string): Promise<{ name: string; path: string; sha: string }[]> {
  const res = await request(r, `/contents/${path}`);
  if (res.status === 404) return [];
  if (!res.ok) await fail(res, `listDir ${path}`);
  const body = await res.json();
  return (body as { name: string; path: string; sha: string }[]).map(({ name, path, sha }) => ({ name, path, sha }));
}

export async function updateFile<T>(
  r: DataRepo, path: string, empty: T, mutate: (current: T) => T, message: string,
): Promise<T> {
  const attempts = 3;
  for (let i = 1; ; i++) {
    const current = await getFile<T>(r, path);
    const next = mutate(current ? current.json : empty);
    try {
      await putFile(r, path, next, current ? current.sha : null, message);
      return next;
    } catch (e) {
      if (!(e instanceof ConflictError) || i >= attempts) throw e;
    }
  }
}
