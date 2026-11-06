import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppData } from '../model/types.ts';
import { toDateKey, localIso } from '../model/dates.ts';
import { AuthError, NotFoundRepoError, RateLimitError, type DataRepo } from '../store/github.ts';
import { localCache } from '../store/cache.ts';
import * as store from '../store/repo.ts';
import { clearConfig, loadConfig, saveConfig } from './config.ts';
import { AppContext, type Actions, type AppState } from './AppContext.tsx';
import { HabitForm } from './HabitForm.tsx';
import { Today } from './Today.tsx';
import { TokenSetup } from './TokenSetup.tsx';
import './app.css';

const BAD_TOKEN = "GitHub didn't accept that token or repo. Paste a new token.";
const RATE_LIMIT = 'GitHub is rate-limiting requests. Try again in a few minutes.';
const SAVE_FAILED = "Couldn't save. Check your connection and try again.";
const TICK_MS = 30_000;

type Status =
  | { kind: 'loading' }
  | { kind: 'auth' }
  | { kind: 'error'; message?: string }
  | { kind: 'ready'; data: AppData };

export function App({ now = () => new Date() }: { now?: () => Date }) {
  const [repo, setRepo] = useState<DataRepo | null>(() => loadConfig());
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [form, setForm] = useState<{ habitId: string | null } | null>(null);
  const [clock, setClock] = useState(() => now());
  const [notice, setNotice] = useState<string | null>(null);
  const cache = useMemo(() => localCache(), []);
  const nowRef = useRef(now);
  nowRef.current = now;

  // A background reload that fails keeps the screen the user is looking at.
  const load = useCallback(async (r: DataRepo, background = false) => {
    try {
      const data = await store.loadAll(r, cache);
      setClock(nowRef.current());
      setStatus({ kind: 'ready', data });
    } catch (e) {
      if (e instanceof AuthError || e instanceof NotFoundRepoError) {
        clearConfig();
        setStatus({ kind: 'auth' });
      } else if (!background) {
        setStatus({ kind: 'error', message: e instanceof RateLimitError ? RATE_LIMIT : undefined });
      }
    }
  }, [cache]);
  const loadRef = useRef(load);
  loadRef.current = load;
  const readyRef = useRef(false);
  readyRef.current = status.kind === 'ready';

  useEffect(() => {
    if (!repo) return;
    setStatus({ kind: 'loading' });
    void load(repo);
  }, [repo]);

  // Keep `now` current: tick while the app is visible, and on resume refresh it and reload.
  useEffect(() => {
    if (!repo) return;
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(() => setClock(nowRef.current()), TICK_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onChange = () => {
      if (document.visibilityState === 'visible') {
        setClock(nowRef.current());
        start();
        if (readyRef.current) void loadRef.current(repo, true);
      } else {
        stop();
      }
    };
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onChange);
    return () => {
      document.removeEventListener('visibilitychange', onChange);
      stop();
    };
  }, [repo]);

  const actions = useMemo<Actions | null>(() => {
    if (!repo) return null;
    // A failed write is shown here, then rethrown so a caller such as the habit form can keep its screen.
    const run = (fn: () => Promise<unknown>) => async () => {
      setNotice(null);
      try {
        await fn();
      } catch (e) {
        if (e instanceof AuthError) {
          clearConfig();
          setStatus({ kind: 'auth' });
        } else {
          setNotice(e instanceof RateLimitError ? RATE_LIMIT : SAVE_FAILED);
        }
        throw e;
      }
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
        <p>{status.message ?? "Couldn't reach GitHub."}</p>
        <button type="button" class="primary" onClick={() => { setStatus({ kind: 'loading' }); void load(repo); }}>Retry</button>
      </div>
    );
  }

  const state: AppState = {
    data: status.data,
    now: clock,
    today: toDateKey(clock),
    repo,
    reload: () => load(repo),
    openForm: (habitId) => setForm({ habitId }),
    actions: actions!,
  };
  return (
    <AppContext.Provider value={state}>
      {notice && (
        <div class="banner" role="alert">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      {form ? (
        <HabitForm habitId={form.habitId} onClose={() => setForm(null)} />
      ) : (
        <Today />
      )}
    </AppContext.Provider>
  );
}
