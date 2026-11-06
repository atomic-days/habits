import { useApp } from './AppContext.tsx';

// Placeholder until the fasting card is built.
export function FastCard() {
  const { data } = useApp();
  if (!data.habits.some((h) => !h.archived && h.done.type === 'timer')) return null;
  return <section class="card" data-testid="fast-card" />;
}
