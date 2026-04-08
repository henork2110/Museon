import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureFile } from './schema';

const __dir = dirname(fileURLToPath(import.meta.url));

export function loadAllFixtures(): FixtureFile[] {
  const names = readdirSync(__dir).filter((n) => n.endsWith('.json'));
  return names.map((n) => JSON.parse(readFileSync(join(__dir, n), 'utf8')) as FixtureFile);
}
