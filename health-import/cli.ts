import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { DateKey, HealthDay } from '../src/model/types.ts';
import { mergeHealth, validatePayload } from './merge.ts';

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error('GITHUB_EVENT_PATH is not set');

const event = JSON.parse(readFileSync(eventPath, 'utf8'));
const payload = validatePayload(event.client_payload);

const dir = 'data/health';
const files: Record<string, Record<DateKey, HealthDay>> = {};
if (existsSync(dir)) {
  for (const name of readdirSync(dir)) {
    const m = /^(\d{4}-\d{2})\.json$/.exec(name);
    if (m) files[m[1]] = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'));
  }
}

const changed = mergeHealth(files, payload);
mkdirSync(dir, { recursive: true });
for (const [month, days] of Object.entries(changed)) {
  const path = `${dir}/${month}.json`;
  writeFileSync(path, JSON.stringify(days, null, 2) + '\n');
  console.log(path);
}
