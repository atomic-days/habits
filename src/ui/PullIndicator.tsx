import type { PullState } from './usePullToRefresh.ts';

export function PullIndicator({ pull, refreshing, dragging, visible }: PullState) {
  if (!visible) return null;
  return (
    <div
      class={`ptr${dragging ? ' dragging' : ''}${refreshing ? ' refreshing' : ''}`}
      style={{ transform: `translateY(${pull}px)`, opacity: Math.min(1, pull / 32) }}
      {...(refreshing
        ? { role: 'status', 'aria-label': 'Refreshing', 'aria-busy': 'true' }
        : { 'aria-hidden': 'true' })}
    >
      <svg class="ptr-spinner" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M16 4a12 12 0 1 0 12 12" />
      </svg>
    </div>
  );
}
