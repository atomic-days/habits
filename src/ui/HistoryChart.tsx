import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { ColorName } from '../model/types.ts';
import { daysBetween } from '../model/dates.ts';
import { PALETTES } from '../model/grid.ts';
import { yTicks, type HistorySeries } from '../model/history.ts';
import { number, shortDay } from './format.ts';

const HEIGHT = 200;
const M = { l: 40, r: 8, t: 10, b: 24 };
const DEFAULT_WIDTH = 320;
const MAX_BAR = 24;
const HIDE_MS = 3000;

const withUnit = (v: number, unit: string): string => (unit === '%' ? `${number(v)}%` : number(v));

function axisLabel(v: number, unit: string, compact: boolean): string {
  if (compact && v >= 1000) return `${number(Number((v / 1000).toFixed(1)))}K${unit === '%' ? '%' : ''}`;
  return withUnit(v, unit);
}

/** Up to four indices spread across the points, always including both ends. */
function labelIndices(n: number): number[] {
  if (n <= 4) return Array.from({ length: n }, (_, i) => i);
  return [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1];
}

function barPath(x: number, w: number, top: number, base: number): string {
  const r = Math.min(4, w / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

export function HistoryChart({ series, color, label }: { series: HistorySeries; color: ColorName; label: string }) {
  const { points, goal, unit, kind, yMax } = series;
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [active, setActive] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const down = useRef(false);
  const moved = useRef(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || DEFAULT_WIDTH);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  const n = points.length;
  const pw = Math.max(1, width - M.l - M.r);
  const ph = HEIGHT - M.t - M.b;
  const band = pw / Math.max(n, 1);
  const cx = (i: number) => M.l + (i + 0.5) * band;
  const y = (v: number) => M.t + ph * (1 - v / yMax);
  const shades = PALETTES[color];
  const shade = (met: boolean) => (met ? shades[3] : shades[2]);
  const ticks = yTicks(yMax);
  const compact = yMax >= 10000;
  const weekly = n > 1 && daysBetween(points[0].date, points[1].date) === 7;

  const hide = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setActive(null);
  };
  const show = (i: number) => {
    setActive(i);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(hide, HIDE_MS);
  };
  const indexAt = (e: PointerEvent): number => {
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const scale = rect.width > 0 ? width / rect.width : 1;
    const x = ((Number.isFinite(e.clientX) ? e.clientX : 0) - rect.left) * scale;
    return Math.min(n - 1, Math.max(0, Math.floor((x - M.l) / band)));
  };

  const onDown = (e: PointerEvent) => {
    if (n === 0) return;
    down.current = true;
    moved.current = false;
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* capture is optional */ }
    show(indexAt(e));
  };
  const onMove = (e: PointerEvent) => {
    if (n === 0 || (!down.current && e.pointerType !== 'mouse')) return;
    const i = indexAt(e);
    if (down.current && i !== active) moved.current = true;
    show(i);
  };
  const onUp = () => {
    // A drag ends with the finger. A plain tap leaves the readout up until the timer runs out.
    if (down.current && moved.current) hide();
    down.current = false;
  };
  const onKey = (e: KeyboardEvent) => {
    if (n === 0) return;
    if (e.key === 'Escape') { hide(); return; }
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (step === 0) return;
    e.preventDefault();
    show(active === null ? n - 1 : Math.min(n - 1, Math.max(0, active + step)));
  };

  const point = active === null ? null : points[active];
  let readout = '';
  if (point) {
    const when = weekly ? `Week of ${shortDay(point.date).slice(4)}` : shortDay(point.date);
    readout = point.value === null ? `${when} · no data`
      : `${when} · ${withUnit(point.value, unit)}${unit === '%' ? '' : ` ${unit}`}`;
  }

  const barW = Math.max(1, Math.min(MAX_BAR, band - 2));
  const marks: JSX.Element[] = [];
  let path = '';
  let open = false;
  points.forEach((p, i) => {
    if (p.value === null) { open = false; return; }
    const px = cx(i);
    if (kind === 'bar') {
      const top = y(Math.min(p.value, yMax));
      if (p.value > 0) {
        marks.push(<path key={p.date} data-bar={p.date} d={barPath(px - barW / 2, barW, top, y(0))} fill={shade(p.met)} />);
      }
    } else {
      path += `${open ? 'L' : 'M'}${px.toFixed(1)},${y(p.value).toFixed(1)}`;
      open = true;
    }
  });

  const gy = goal === null ? 0 : y(goal);
  const goalBelow = goal !== null && gy - 14 < M.t;
  const goalText = goal === null ? '' : `Goal ${number(goal)}${unit === 'hours' ? 'h' : ''}`;

  return (
    <div class="chart" ref={box}>
      <div class="chart-readout" role="status" aria-live="polite">{readout}</div>
      <svg
        role="img" aria-label={label} tabIndex={0}
        width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { down.current = false; hide(); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide(); }}
        onKeyDown={onKey}
      >
        {ticks.map((t, i) => (
          <g key={t}>
            {i > 0 && <line data-gridline x1={M.l} x2={M.l + pw} y1={y(t)} y2={y(t)} class="c-grid" />}
            <text x={M.l - 6} y={y(t) + 4} text-anchor="end" class="c-axis">{axisLabel(t, unit, compact)}</text>
          </g>
        ))}
        <line x1={M.l} x2={M.l + pw} y1={y(0)} y2={y(0)} class="c-base" />

        {marks}
        {kind === 'line' && path && (
          <path data-testid="line-path" d={path} fill="none" stroke={shades[3]} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        )}
        {kind === 'line' && points.map((p, i) => p.value === null ? null : (
          <circle key={p.date} data-dot={p.date} cx={cx(i)} cy={y(p.value)} r={i === active ? 5.5 : 4} fill={shade(p.met)} class="c-ring" />
        ))}

        {goal !== null && (
          <>
            <line data-testid="goal-line" x1={M.l} x2={M.l + pw} y1={gy} y2={gy} stroke-dasharray="4 4" class="c-goal" />
            <text x={M.l + pw - 2} y={goalBelow ? gy + 13 : gy - 4} text-anchor="end" class="c-goal-label">{goalText}</text>
          </>
        )}

        {labelIndices(n).map((i, k, all) => (
          <text key={i} y={HEIGHT - 6} class="c-axis"
            x={k === 0 ? M.l : k === all.length - 1 ? M.l + pw : cx(i)}
            text-anchor={k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle'}>
            {shortDay(points[i].date).slice(4)}
          </text>
        ))}

        {active !== null && (
          <line data-testid="crosshair" x1={cx(active)} x2={cx(active)} y1={M.t} y2={y(0)} class="c-cross" />
        )}
      </svg>
    </div>
  );
}
