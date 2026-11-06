import type { DataRepo } from '../store/github.ts';

const KEY = 'habits.config';

export function loadConfig(): DataRepo | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<DataRepo>;
    if (!c.owner || !c.repo || !c.token) return null;
    return { owner: c.owner, repo: c.repo, token: c.token };
  } catch {
    return null;
  }
}

export function saveConfig(c: DataRepo): void {
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function clearConfig(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage blocked: nothing to clear
  }
}
