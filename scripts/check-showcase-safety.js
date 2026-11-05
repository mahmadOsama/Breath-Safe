import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const firestoreRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
const rtdbRules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'));
const recoveryPage = await readFile(new URL('../Login-codes/forgot-password.html', import.meta.url), 'utf8');
const ignoreFile = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');

assert.match(firestoreRules, /allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;/,
  'Firestore showcase rules must remain deny-all.');
assert.equal(rtdbRules.rules['.read'], false,
  'Realtime Database showcase rules must deny all reads.');
assert.equal(rtdbRules.rules['.write'], false,
  'Realtime Database showcase rules must deny all writes.');
assert.doesNotMatch(recoveryPage, /<form\b|emailjs|firebase-app|firebase-firestore|forgot-password\.js/i,
  'Disabled recovery page must not collect email or load credential/database code.');
assert.match(recoveryPage, /recovery is unavailable|recovery is disabled|account recovery is unavailable/i,
  'Disabled recovery page must clearly state that recovery is unavailable.');

const ignored = (path) => {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '--quiet', path], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

assert.match(ignoreFile, /^\.env$/m, '.env must remain ignored.');
assert.match(ignoreFile, /^serviceAccountKey\.json$/m, 'Service-account key must remain ignored.');
assert.ok(ignored('.env'), 'Git must ignore .env.');
assert.ok(ignored('serviceAccountKey.json'), 'Git must ignore serviceAccountKey.json.');

console.log('Showcase safety checks passed (deny-all rules, disabled credential recovery, ignored local secrets).');
