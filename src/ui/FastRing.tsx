import { formatClock, ringCaption, ringGeometry } from './fastRing.ts';

const GOLD = '#ffb23f';
const PALE = '#ffe2a8';
const LAP2 = '#fffaf2';

export function FastRing({ hours, goalHours }: { hours: number; goalHours: number }) {
  const g = ringGeometry(hours, goalHours);
  const headColor = hours > 24 ? LAP2 : hours > goalHours ? PALE : GOLD;
  return (
    <svg class="fast-ring" viewBox="0 0 140 140" width="140" height="140" role="img"
      aria-label={`${formatClock(hours)} fasted, ${ringCaption(hours, goalHours)}`}>
      <circle cx="70" cy="70" r="58" fill="none" stroke="#2a2e35" stroke-width="12" />
      {g.seg1 && <path d={g.seg1} fill="none" stroke={GOLD} stroke-width="12" />}
      {g.seg2 && <path d={g.seg2} fill="none" stroke={PALE} stroke-width="12" />}
      {g.lap2 && <path d={g.lap2} fill="none" stroke={LAP2} stroke-width="4" stroke-linecap="round" />}
      <line x1={g.tick.x1} y1={g.tick.y1} x2={g.tick.x2} y2={g.tick.y2} stroke="var(--text-2)" stroke-width="2" />
      <circle cx={g.head.x} cy={g.head.y} r="7" fill="#0f1115" stroke={headColor} stroke-width="4" />
      <text x="70" y="72" text-anchor="middle" class="ring-clock" font-size="28" fill="var(--text)">{formatClock(hours)}</text>
      <text x="70" y="92" text-anchor="middle" font-size="11" fill="var(--muted)">{ringCaption(hours, goalHours)}</text>
    </svg>
  );
}
