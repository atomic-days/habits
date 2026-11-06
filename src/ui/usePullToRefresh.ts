import { useEffect, useRef, useState } from 'preact/hooks';

export const MAX_PULL = 80;
export const TRIGGER = 64;
/** Where the indicator rests while a refresh runs. */
export const HOLD = 48;
const SETTLE_MS = 200;

const scrollTop = () => (document.scrollingElement ?? document.documentElement).scrollTop;
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Finger distance to indicator distance: eases toward MAX_PULL, so 88px of drag reaches TRIGGER. */
const resist = (dy: number) => MAX_PULL * Math.tanh(dy / MAX_PULL);

export interface PullState {
  /** How far the indicator is pulled down, in px. */
  pull: number;
  refreshing: boolean;
  /** The finger is down and moving the indicator, so it should follow without easing. */
  dragging: boolean;
  /** The indicator should be on screen, including while it springs back. */
  visible: boolean;
}

export function usePullToRefresh(onRefresh: () => Promise<void>): PullState {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const latest = useRef(onRefresh);
  latest.current = onRefresh;

  useEffect(() => {
    let startY: number | null = null;
    let current = 0;
    let busy = false;
    let timer: number | undefined;

    const settle = () => {
      setSettling(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSettling(false), reducedMotion() ? 0 : SETTLE_MS);
    };
    const show = (v: number) => { current = v; setPull(v); };

    const onStart = (e: TouchEvent) => {
      startY = !busy && e.touches.length === 1 && scrollTop() <= 0 ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        if (current > 0) show(0);
        setDragging(false);
        return;
      }
      // Stop the browser's own bounce only while this gesture is pulling.
      if (e.cancelable) e.preventDefault();
      window.clearTimeout(timer);
      setSettling(false);
      setDragging(true);
      show(resist(dy));
    };
    const onEnd = async () => {
      if (startY === null) return;
      startY = null;
      setDragging(false);
      if (current < TRIGGER) {
        if (current > 0) { show(0); settle(); }
        return;
      }
      busy = true;
      setRefreshing(true);
      show(HOLD);
      try {
        await latest.current();
      } catch { /* the app shows its own offline status */ }
      busy = false;
      setRefreshing(false);
      show(0);
      settle();
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    // Not passive: preventDefault stops the bounce while the indicator is being pulled.
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return { pull, refreshing, dragging, visible: pull > 0 || refreshing || settling };
}
