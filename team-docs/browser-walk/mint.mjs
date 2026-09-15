/**
 * Mint a read-only student session for the browser walk (temporary — team-docs only).
 *
 * Uses the backend's OWN `generateLoginToken` so the payload is byte-for-byte the
 * shape `/students/login` issues (students carry admission_no + student_name).
 * The token is written to `team-docs/browser-walk/.token` and only its LENGTH is
 * printed — never the token, never the secret. `.env` is read by the app's own
 * dotenv, not by hand.
 *
 * Usage: node team-docs/browser-walk/mint.mjs <admission_no> [school_id] [name]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(HERE, '..', '..', 'backend');

require(join(BACKEND, 'node_modules', 'dotenv')).config({ path: join(BACKEND, '.env') });
const { generateLoginToken } = require(join(BACKEND, 'src', 'middleware', 'sessionAuth.js'));

const [admission, schoolId = 'SCH-ELITE', name = 'Walk Child'] = process.argv.slice(2);
if (!admission) {
  console.error('usage: mint.mjs <admission_no> [school_id] [name]');
  process.exit(2);
}
if (!process.env.JWT_SECRET_KEY) {
  console.error('JWT_SECRET_KEY missing from backend/.env');
  process.exit(3);
}

const token = generateLoginToken(
  {
    id: admission,
    admission_no: admission,
    student_name: name,
    user_type: 'student',
    email: null,
    school_id: schoolId,
    branch_id: null,
  },
  '2h',
);

writeFileSync(join(HERE, '.token'), token);
console.log(`token minted for ${admission} @ ${schoolId} (${token.length} chars) -> team-docs/browser-walk/.token`);
