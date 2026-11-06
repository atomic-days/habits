const C = 70;
const R = 58;
const TURN = 2 * Math.PI;

export interface Pt { x: number; y: number }
export interface RingGeometry {
  seg1: string; seg2: string; lap2: string; head: Pt;
  tick: { x1: number; y1: number; x2: number; y2: number };
}

/** A 24-hour clock that starts at the top and runs clockwise. */
function pointAt(hours: number, r: number): Pt {
  const a = (hours / 24) * TURN;
  return { x: C + r * Math.sin(a), y: C - r * Math.cos(a) };
}

function arc(from: number, to: number): string {
  if (to <= from) return '';
  const f = (p: Pt) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  const mid = (from + to) / 2;
  // An SVG arc can't span a full circle, so a long span goes out in two halves.
  if (to - from >= 12) {
    return `M ${f(pointAt(from, R))} A ${R} ${R} 0 0 1 ${f(pointAt(mid, R))} A ${R} ${R} 0 0 1 ${f(pointAt(to, R))}`;
  }
  return `M ${f(pointAt(from, R))} A ${R} ${R} 0 0 1 ${f(pointAt(to, R))}`;
}

export function ringGeometry(hours: number, goalHours: number): RingGeometry {
  const h = Math.max(0, hours);
  const a = pointAt(goalHours, 49);
  const b = pointAt(goalHours, 67);
  return {
    seg1: arc(0, Math.min(h, goalHours)),
    seg2: arc(goalHours, Math.min(h, 24)),
    lap2: h > 24 ? arc(0, Math.min(h - 24, 24)) : '',
    head: pointAt(h > 24 ? Math.min(h - 24, 24) : h, R),
    tick: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
  };
}

function hm(hours: number): string {
  const total = Math.round(Math.max(0, hours) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** '18:45' */
export function formatClock(hours: number): string {
  return hm(hours);
}

export function ringCaption(hours: number, goalHours: number): string {
  if (hours < goalHours) return `goal ${goalHours}h`;
  return `+${hm(hours - goalHours)} past ${goalHours}h`;
}
