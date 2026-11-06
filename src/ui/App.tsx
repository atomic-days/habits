import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { AppData } from '../model/types.ts';
import { toDateKey, localIso } from '../model/dates.ts';
import { AuthError, NotFoundRepoError, type DataRepo } from '../store/github.ts';
import { localCache } from '../store/cache.ts';
import * as store from '../store/repo.ts';
import { clearConfig, loadConfig, saveConfig } from './config.ts';
import { AppContext, type Actions, type AppState } from './AppContext.tsx';
import { HabitForm } from './HabitForm.tsx';
import { Today } from './Today.tsx';
import { TokenSetup } from './TokenSetup.tsx';
import './app.css';

const BAD_TOKEN = "GitHub didn't accept that token or repo. Paste a new token.";

type Status =
  | { kind: 'loading' }
  | { kind: 'auth' }
  | { kind: 'error' }
  | { kind: 'ready'; data: AppData; now: Date };

export function App({ now = () => new Date() }: { now?: () => Date }) {
  const [repo, setRepo] = useState<DataRepo | null>(() => loadConfig());
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [form, setForm] = useState<{ habitId: string | null } | null>(null);
  const cache = useMemo(() => localCache(), []);

  const load = useCallback(async (r: DataRepo) => {
    try {
      const data = await store.loadAll(r, cache);
      setStatus({ kind: 'ready', data, now: now() });
    } catch (e) {
      if (e instanceof AuthError || e instanceof NotFoundRepoError) {
        clearConfig();
        setStatus({ kind: 'auth' });
      } else {
        setStatus({ kind: 'error' });
      }
    }
  }, [cache, now]);

  useEffect(() => {
    if (!repo) return;
    setStatus({ kind: 'loading' });
    void load(repo);
  }, [repo]);

  const actions = useMemo<Actions | null>(() => {
    if (!repo) return null;
    const run = (fn: () => Promise<unknown>) => async () => {
      await fn();
      await load(repo);
    };
    return {
      markDone: (habit, date) => run(() => store.upsertLog(repo, { habit, date, value: 1, at: localIso(now()) }))(),
      undoDone: (habit, date) => run(() => store.removeLog(repo, habit, date))(),
      setNumber: (habit, date, value) => run(() => store.upsertLog(repo, { habit, date, value, at: localIso(now()) }))(),
      startFast: run(() => store.startFast(repo, localIso(now()))),
      endFast: (id) => run(() => store.updateFast(repo, id, { end: localIso(now()) }))(),
      editFast: (id, patch) => run(() => store.updateFast(repo, id, patch))(),
      saveHabit: (h) => run(() => store.saveHabit(repo, h))(),
      setArchived: (id, archived) => run(() => store.setArchived(repo, id, archived))(),
      deleteHabit: (id) => run(() => store.deleteHabit(repo, id))(),
    };
  }, [repo, load, now]);

  if (!repo || status.kind === 'auth') {
    return (
      <TokenSetup
        message={status.kind === 'auth' ? BAD_TOKEN : undefined}
        onSave={(c) => {
          saveConfig(c);
          setRepo(c);
        }}
      />
    );
  }
  if (status.kind === 'loading') return <p class="status">Loading…</p>;
  if (status.kind === 'error') {
    return (
      <div class="status">
        <p>Couldn't reach GitHub.</p>
        <button type="button" class="primary" onClick={() => { setStatus({ kind: 'loading' }); void load(repo); }}>Retry</button>
      </div>
    );
  }

  const state: AppState = {
    data: status.data,
    now: status.now,
    today: toDateKey(status.now),
    repo,
    reload: () => load(repo),
    openForm: (habitId) => setForm({ habitId }),
    actions: actions!,
  };
  return (
    <AppContext.Provider value={state}>
      {form ? (
        <HabitForm habitId={form.habitId} onClose={() => setForm(null)} />
      ) : (
        <Today />
      )}
    </AppContext.Provider>
  );
}
