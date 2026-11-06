import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AppData } from '../model/types.ts';
import { toDateKey, localIso } from '../model/dates.ts';
import { applyOp } from '../model/applyOp.ts';
import { AuthError, NetworkError, NotFoundRepoError, RateLimitError, type DataRepo } from '../store/github.ts';
import { localCache } from '../store/cache.ts';
import { flush, localOutbox, type NewOp, type Op } from '../store/outbox.ts';
import * as store from '../store/repo.ts';
import { clearConfig, loadConfig, saveConfig } from './config.ts';
import { AppContext, type Actions, type AppState } from './AppContext.tsx';
import { HabitForm } from './HabitForm.tsx';
import { Today } from './Today.tsx';
import { TokenSetup } from './TokenSetup.tsx';
import './app.css';

const BAD_TOKEN = "GitHub didn't accept that token or repo. Paste a new token.";
const RATE_LIMIT = 'GitHub is rate-limiting requests. Try again in a few minutes.';
const DROPPED = "Couldn't save a change after 3 tries, so it was dropped.";
const TICK_MS = 30_000;
const SYNCED_KEY = 'habits.syncedAt';

function readSyncedAt(): string | null {
  try { return localStorage.getItem(SYNCED_KEY); } catch { return null; }
}

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
  const [pending, setPending] = useState<Op[]>([]);
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(() => readSyncedAt());
  const cache = useMemo(() => localCache(), []);
  const outbox = useMemo(() => localOutbox(), []);
  const nowRef = useRef(now);
  nowRef.current = now;
  const loadSeq = useRef(0);

  // A background reload that fails keeps the screen the user is looking at.
  const load = useCallback(async (r: DataRepo, background = false) => {
    // Only the newest load may land, so a slow older read can't overwrite fresher data.
    const seq = ++loadSeq.current;
    try {
      const data = await store.loadAll(r, cache);
      if (seq !== loadSeq.current) return;
      const stamp = localIso(nowRef.current());
      try { localStorage.setItem(SYNCED_KEY, stamp); } catch { /* only used for the offline label */ }
      setSyncedAt(stamp);
      setOffline(false);
      setClock(nowRef.current());
      setStatus({ kind: 'ready', data });
    } catch (e) {
      if (seq !== loadSeq.current) return;
      if (e instanceof AuthError || e instanceof NotFoundRepoError) {
        clearConfig();
        setStatus({ kind: 'auth' });
        return;
      }
      if (e instanceof NetworkError) setOffline(true);
      if (!background) {
        setStatus({ kind: 'error', message: e instanceof RateLimitError ? RATE_LIMIT : undefined });
      }
    }
  }, [cache]);
  const loadRef = useRef(load);
  loadRef.current = load;
  const readyRef = useRef(false);
  readyRef.current = status.kind === 'ready';

  // Sends the queue, shows the result, and reloads from GitHub once the queue is empty.
  const flushNow = useCallback(async (r: DataRepo) => {
    if (outbox.list().length === 0) return;
    setSyncing(true);
    const res = await flush(r, outbox);
    setSyncing(false);
    setPending(outbox.list());
    if (res.dropped.length > 0) setNotice(DROPPED);
    if (res.stopped === 'network') setOffline(true);
    else if (res.sent.length > 0) setOffline(false);
    if (res.stopped === 'auth') {
      clearConfig();
      setStatus({ kind: 'auth' });
      return;
    }
    if (res.stopped === 'rate') setNotice(RATE_LIMIT);
    // Keep what was sent visible if the reload fails or hasn't finished.
    if (res.sent.length > 0) {
      setStatus((s) => (s.kind === 'ready' ? { kind: 'ready', data: res.sent.reduce(applyOp, s.data) } : s));
    }
    if (outbox.list().length === 0 && (res.sent.length > 0 || res.dropped.length > 0)) {
      await loadRef.current(r, true);
    }
  }, [outbox]);
  const flushRef = useRef(flushNow);
  flushRef.current = flushNow;

  useEffect(() => {
    if (!repo) return;
    setPending(outbox.list());
    // Show the last synced data at once, then refresh it in the background.
    const cached = store.loadFromCache(cache);
    setStatus(cached ? { kind: 'ready', data: cached } : { kind: 'loading' });
    void load(repo, !!cached);
    void flushRef.current(repo);
  }, [repo]);

  // Back on the network or back in the app: send the queue, or just refresh when it is empty.
  useEffect(() => {
    if (!repo) return;
    const resume = () => {
      if (outbox.list().length > 0) void flushRef.current(repo);
      else if (readyRef.current) void loadRef.current(repo, true);
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', resume);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', onOffline);
    };
  }, [repo]);

  // While changes wait, try again every 30 seconds.
  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!repo || !hasPending) return;
    const timer = window.setInterval(() => void flushRef.current(repo), TICK_MS);
    return () => clearInterval(timer);
  }, [repo, hasPending]);

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
        if (outbox.list().length > 0) void flushRef.current(repo);
        else if (readyRef.current) void loadRef.current(repo, true);
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
    // Every tap is queued with its tap time, shown at once, and sent by the flush. Online or not.
    const enqueue = async (op: NewOp) => {
      setNotice(null);
      outbox.add(op);
      setPending(outbox.list());
      void flushRef.current(repo);
    };
    const at = () => localIso(nowRef.current());
    return {
      markDone: (habit, date) => enqueue({ type: 'markDone', args: { habit, date }, at: at() }),
      undoDone: (habit, date) => enqueue({ type: 'undoDone', args: { habit, date }, at: at() }),
      setNumber: (habit, date, value) => enqueue({ type: 'setNumber', args: { habit, date, value }, at: at() }),
      startFast: () => enqueue({ type: 'startFast', args: { id: crypto.randomUUID() }, at: at() }),
      endFast: (id) => enqueue({ type: 'endFast', args: { id }, at: at() }),
      editFast: (id, patch) => enqueue({ type: 'editFast', args: { id, patch }, at: at() }),
      saveHabit: (habit) => enqueue({ type: 'saveHabit', args: { habit }, at: at() }),
      setArchived: (id, archived) => enqueue({ type: 'setArchived', args: { id, archived }, at: at() }),
      deleteHabit: (id) => enqueue({ type: 'deleteHabit', args: { id }, at: at() }),
    };
  }, [repo, outbox]);

  // The screen shows the last synced data with the queued taps applied on top.
  const syncedData = status.kind === 'ready' ? status.data : null;
  const shown = useMemo(() => (syncedData ? pending.reduce(applyOp, syncedData) : null), [syncedData, pending]);

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
        <button type="button" class="primary" onClick={() => { setStatus({ kind: 'loading' }); void load(repo); void flushRef.current(repo); }}>Retry</button>
      </div>
    );
  }

  const state: AppState = {
    data: shown!,
    now: clock,
    today: toDateKey(clock),
    repo,
    reload: () => load(repo),
    openForm: (habitId) => setForm({ habitId }),
    actions: actions!,
    sync: { offline, pending: pending.length, syncing, syncedAt },
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
