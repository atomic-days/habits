import { useState } from 'preact/hooks';
import { useApp } from './AppContext.tsx';

export const DISMISSED_KEY = 'habits.connectHealthDismissed';
const RUN = 'shortcuts://run-shortcut?name=Habits%20sync';

function wasDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

/** Setup steps for the Health shortcut. Shown until the first Health day arrives or the user dismisses it. */
export function ConnectHealthCard() {
  const { data } = useApp();
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed || Object.keys(data.health).length > 0) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private mode: hidden until reload */ }
    setDismissed(true);
  }

  return (
    <section class="connect" aria-labelledby="connect-title">
      <div class="connect-top">
        <h2 id="connect-title">Connect Apple Health</h2>
        <button type="button" onClick={dismiss}>Dismiss</button>
      </div>
      <ol class="connect-steps">
        <li>
          <a href={`${import.meta.env.BASE_URL}habits-sync.shortcut`}>Add the Health shortcut</a>
          <div class="faint">Paste your habits key when it asks.</div>
        </li>
        <li>
          <a href={RUN}>Run it once and allow Health</a>
          <div class="faint">Turn on every Health type it asks for.</div>
        </li>
        <li>
          <a href={`${RUN}&input=text&text=365`}>Bring in the past year</a>
          <div class="faint">This takes a few minutes.</div>
        </li>
      </ol>
      <p class="note">
        iOS needs automations added by hand. Open Shortcuts, then Automation, and add three: when an Apple Watch
        workout ends, at 7:30 AM and at 9:30 PM. Each one runs Habits sync with Run Immediately turned on.
      </p>
    </section>
  );
}
