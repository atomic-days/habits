import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { AppData, DateKey, Habit } from '../model/types.ts';
import type { DataRepo } from '../store/github.ts';

export interface Actions {
  markDone(habit: string, date: DateKey): Promise<void>;
  undoDone(habit: string, date: DateKey): Promise<void>;
  setNumber(habit: string, date: DateKey, value: number): Promise<void>;
  startFast(): Promise<void>;
  endFast(id: string): Promise<void>;
  editFast(id: string, patch: { start?: string; end?: string | null }): Promise<void>;
  saveHabit(h: Habit): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<void>;
  deleteHabit(id: string): Promise<void>;
}

export interface SyncInfo {
  /** The last attempt to reach GitHub failed with no response. */
  offline: boolean;
  /** Changes in the outbox that GitHub doesn't have yet. */
  pending: number;
  syncing: boolean;
  /** When the synced data was last loaded from GitHub, as a local ISO time. */
  syncedAt: string | null;
}

export interface AppState {
  data: AppData;
  now: Date;
  today: DateKey;
  repo: DataRepo;
  reload(): Promise<void>;
  /** Sends queued taps, then reloads from GitHub. Missing in a bare test context, which falls back to reload. */
  refresh?(): Promise<void>;
  openForm(habitId: string | null): void;
  actions: Actions;
  /** Offline and outbox state. Missing in a bare test context, which reads as online and idle. */
  sync?: SyncInfo;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp must be used inside <App>');
  return v;
}
