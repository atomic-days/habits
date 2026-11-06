// Imports the files the Habits sync shortcut puts in data/inbox/, then removes them.
// Runs from the data repo root: node app/health-import/inbox.ts
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import type { DateKey, HealthDay } from '../src/model/types.ts';
import { keepStoredWorkouts, parseInbox } from './inbox-parse.ts';
import { mergeHealth, validatePayload } from './merge.ts';

const INBOX = 'data/inbox';
const FAILED = `${INBOX}/failed`;
const HEALTH = 'data/health';

const files: Record<string, Record<DateKey, HealthDay>> = {};
if (existsSync(HEALTH)) {
  for (const name of readdirSync(HEALTH)) {
    const m = /^(\d{4}-\d{2})\.json$/.exec(name);
    if (m) files[m[1]] = JSON.parse(readFileSync(`${HEALTH}/${name}`, 'utf8'));
  }
}

// File names are yyyyMMdd-HHmmss, so sorted order is the order the phone sent them.
const names = existsSync(INBOX) ? readdirSync(INBOX).filter((n) => n.endsWith('.txt')).sort() : [];
const changedMonths = new Set<string>();

for (const name of names) {
  const path = `${INBOX}/${name}`;
  let payload;
  let skipped = 0;
  try {
    const parsed = parseInbox(readFileSync(path, 'utf8'));
    skipped = parsed.skipped;
    payload = validatePayload({ sentAt: parsed.sentAt, days: keepStoredWorkouts(files, parsed.days) });
  } catch (e) {
    // Keep a file we can't read, out of the way, so the next run doesn't trip on it again.
    console.error(`${name}: ${(e as Error).message}. Moved to ${FAILED}/`);
    mkdirSync(FAILED, { recursive: true });
    renameSync(path, `${FAILED}/${name}`);
    continue;
  }
  const changed = mergeHealth(files, payload);
  for (const [month, days] of Object.entries(changed)) {
    files[month] = days;
    changedMonths.add(month);
  }
  unlinkSync(path);
  console.log(`${name}: ${Object.keys(payload.days).length} days, sent ${payload.sentAt}, bad lines skipped: ${skipped}`);
}

mkdirSync(HEALTH, { recursive: true });
for (const month of [...changedMonths].sort()) {
  const path = `${HEALTH}/${month}.json`;
  writeFileSync(path, JSON.stringify(files[month], null, 2) + '\n');
  console.log(path);
}
