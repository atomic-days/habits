export interface FileCache {
  get(path: string): { sha: string; json: unknown } | null;
  set(path: string, sha: string, json: unknown): void;
  paths(): string[];
}

const KEY = 'habits.cache.v1';

type Store = Record<string, { sha: string; json: unknown }>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function localCache(): FileCache {
  return {
    get: (path) => read()[path] ?? null,
    paths: () => Object.keys(read()),
    set: (path, sha, json) => {
      const all = read();
      all[path] = { sha, json };
      try {
        localStorage.setItem(KEY, JSON.stringify(all));
      } catch {
        // storage full or blocked: the cache is only an optimization
      }
    },
  };
}
