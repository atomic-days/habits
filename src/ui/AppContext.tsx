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

export interface AppState {
  data: AppData;
  now: Date;
  today: DateKey;
  repo: DataRepo;
  reload(): Promise<void>;
  openForm(habitId: string | null): void;
  actions: Actions;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp must be used inside <App>');
  return v;
}
