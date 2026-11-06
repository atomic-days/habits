import { addDays, dateKeyAt, toDateKey } from '../model/dates.ts';
import { useApp } from './AppContext.tsx';
import { shortDay, timeOfDay } from './format.ts';

const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`;

function dataFrom(iso: string | null, now: Date): string {
  if (iso === null) return 'earlier';
  const day = dateKeyAt(iso);
  const time = timeOfDay(iso);
  return day === toDateKey(now) ? time : day === addDays(toDateKey(now), -1) ? `yesterday ${time}` : `${shortDay(day)} ${time}`;
}

/** One line under the Today header: offline, waiting changes, syncing, or nothing. */
export function SyncStatus() {
  const { sync, now } = useApp();
  if (!sync) return null;
  const { offline, pending, syncing, syncedAt } = sync;
  let text: string | null = null;
  if (offline) {
    text = pending > 0
      ? `Offline. ${changes(pending)} waiting to sync.`
      : `Offline. Showing data from ${dataFrom(syncedAt, now)}.`;
  } else if (pending > 0) {
    text = syncing ? `Syncing ${changes(pending)}…` : `${changes(pending)} waiting to sync.`;
  }
  return text === null ? null : <div class="faint syncstatus" role="status">{text}</div>;
}
