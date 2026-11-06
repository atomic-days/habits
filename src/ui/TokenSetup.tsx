import { useState } from 'preact/hooks';
import type { DataRepo } from '../store/github.ts';
import './app.css';

const DEFAULT_REPO = 'dhruvmetha/habits-data';

export function TokenSetup({ message, onSave }: { message?: string; onSave: (c: DataRepo) => void }) {
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState(DEFAULT_REPO);

  const submit = (e: Event) => {
    e.preventDefault();
    const [owner, repo] = repoName.trim().split('/');
    if (!token.trim() || !owner || !repo) return;
    onSave({ owner, repo, token: token.trim() });
  };

  return (
    <form class="setup" onSubmit={submit}>
      <h1>Habits</h1>
      {message && <p class="error" role="alert">{message}</p>}
      <label>
        GitHub token
        <input type="password" autocomplete="off" value={token} onInput={(e) => setToken(e.currentTarget.value)} />
      </label>
      <label>
        Data repo
        <input type="text" autocapitalize="none" value={repoName} onInput={(e) => setRepoName(e.currentTarget.value)} />
      </label>
      <p class="hint">Use a fine-grained token limited to the data repo, with Contents read and write.</p>
      <button type="submit" class="primary">Save</button>
    </form>
  );
}
