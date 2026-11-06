import { useEffect, useRef, useState } from 'preact/hooks';
import { healthShas } from '../store/repo.ts';
import { useApp } from './AppContext.tsx';
import { SHAS_KEY, STARTED_KEY, syncUrl, syncedLabel } from './sync.ts';

const WINDOW_MS = 5 * 60_000;
const POLL_MS = 10_000;
const GIVE_UP_MS = 120_000;

type Phase = 'idle' | 'waiting' | 'failed';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* private mode: the row just skips the wait */ }
}

function differs(before: Record<string, string>, now: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(now)]);
  for (const k of keys) if (before[k] !== now[k]) return true;
  return false;
}

export function SyncRow() {
  const { data, now, repo, reload } = useApp();
  const [phase, setPhase] = useState<Phase>('idle');
  const polling = useRef<number | null>(null);
  const latest = useRef({ repo, reload });
  latest.current = { repo, reload };

  function stop() {
    if (polling.current !== null) clearInterval(polling.current);
    polling.current = null;
  }

  function startPolling() {
    if (polling.current !== null) return;
    const started = Number(read(STARTED_KEY));
    if (!started || Date.now() - started > WINDOW_MS) return;
    let before: Record<string, string> = {};
    try { before = JSON.parse(read(SHAS_KEY) ?? '{}'); } catch { /* treat as empty */ }
    setPhase('waiting');
    let busy = false;
    // Once a file changes, keep polling until a poll sees nothing new. The 7-day window can span
    // two months, and the shortcut sends one event per month, so the second file can land later.
    let seenChange = false;
    let last = before;
    const begun = Date.now();
    polling.current = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      let current: Record<string, string> | null = null;
      try {
        current = await healthShas(latest.current.repo);
      } catch { /* try again on the next tick */ }
      busy = false;
      if (polling.current === null) return;
      let settled = false;
      if (current !== null) {
        if (!seenChange) {
          if (differs(before, current)) { seenChange = true; last = current; }
        } else if (differs(last, current)) {
          last = current;
        } else {
          settled = true;
        }
      }
      const timedOut = Date.now() - begun >= GIVE_UP_MS;
      if (settled || (timedOut && seenChange)) {
        stop();
        write(STARTED_KEY, null);
        setPhase('idle');
        await latest.current.reload();
      } else if (timedOut) {
        stop();
        write(STARTED_KEY, null);
        setPhase('failed');
      }
    }, POLL_MS);
  }

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') startPolling(); };
    document.addEventListener('visibilitychange', onVisible);
    onVisible();
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      stop();
    };
  }, []);

  async function syncNow() {
    let shas: Record<string, string> = {};
    try { shas = await healthShas(repo); } catch { /* an empty baseline still detects any file */ }
    write(SHAS_KEY, JSON.stringify(shas));
    write(STARTED_KEY, String(Date.now()));
    setPhase('idle');
    location.href = syncUrl();
  }

  return (
    <section class="sync" aria-label="Apple Health sync">
      <div>
        <div class="muted">{syncedLabel(data.healthSyncedAt, now)}</div>
        {phase === 'waiting' && <div class="faint" role="status">Waiting for Apple Health…</div>}
        {phase === 'failed' && <div class="error" role="status">Sync didn't arrive. Try again.</div>}
      </div>
      <button type="button" onClick={() => void syncNow()}>Sync now</button>
    </section>
  );
}
