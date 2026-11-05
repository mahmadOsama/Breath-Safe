import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';

const DEMO_PROJECT_ID = 'demo-breathsafe';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const DATABASE_HOST = '127.0.0.1';
const DATABASE_PORT = 9000;

const configuredProjects = [
  process.env.GCLOUD_PROJECT,
  process.env.GOOGLE_CLOUD_PROJECT
].filter(Boolean);

if (configuredProjects.some((projectId) => projectId !== DEMO_PROJECT_ID)) {
  throw new Error('Rules tests are blocked unless the selected project is demo-breathsafe.');
}

if (process.env.FIREBASE_CONFIG) {
  let firebaseConfig;
  try {
    firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
  } catch {
    throw new Error('Rules tests are blocked because FIREBASE_CONFIG is not valid JSON.');
  }

  if (firebaseConfig.projectId && firebaseConfig.projectId !== DEMO_PROJECT_ID) {
    throw new Error('Rules tests are blocked unless FIREBASE_CONFIG selects demo-breathsafe.');
  }
}

let testEnvironment;

beforeAll(async () => {
  const [firestoreRules, databaseRules] = await Promise.all([
    readFile(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8'),
    readFile(fileURLToPath(new URL('../database.rules.json', import.meta.url)), 'utf8')
  ]);

  testEnvironment = await initializeTestEnvironment({
    projectId: DEMO_PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules: firestoreRules
    },
    database: {
      host: DATABASE_HOST,
      port: DATABASE_PORT,
      rules: databaseRules
    }
  });

  if (
    testEnvironment.projectId !== DEMO_PROJECT_ID ||
    testEnvironment.emulators.firestore?.host !== FIRESTORE_HOST ||
    testEnvironment.emulators.firestore?.port !== FIRESTORE_PORT ||
    testEnvironment.emulators.database?.host !== DATABASE_HOST ||
    testEnvironment.emulators.database?.port !== DATABASE_PORT
  ) {
    throw new Error('Rules tests require demo-breathsafe and localhost emulators only.');
  }
});

afterAll(async () => {
  await testEnvironment?.cleanup();
});

const firestoreRead = (firestore, documentId) =>
  firestore.collection('security-checks').doc(documentId).get();

const firestoreWrite = (firestore, documentId) =>
  firestore.collection('security-checks').doc(documentId).set({ allowed: true });

const databaseRead = (database, recordId) =>
  database.ref(`security-checks/${recordId}`).once('value');

const databaseWrite = (database, recordId) =>
  database.ref(`security-checks/${recordId}`).set({ allowed: true });

describe('Firestore deny-all rules', () => {
  test.each([
    ['unauthenticated', () => testEnvironment.unauthenticatedContext()],
    ['regular user', () => testEnvironment.authenticatedContext('regular-user')],
    ['admin claim', () => testEnvironment.authenticatedContext('mock-admin', { admin: true })]
  ])('deny reads and writes for %s clients', async (label, createContext) => {
    const firestore = createContext().firestore();
    await assertFails(firestoreRead(firestore, `${label}-read`));
    await assertFails(firestoreWrite(firestore, `${label}-write`));
  });
});

describe('Realtime Database deny-all rules', () => {
  test.each([
    ['unauthenticated', () => testEnvironment.unauthenticatedContext()],
    ['regular user', () => testEnvironment.authenticatedContext('regular-user')],
    ['admin claim', () => testEnvironment.authenticatedContext('mock-admin', { admin: true })]
  ])('deny reads and writes for %s clients', async (label, createContext) => {
    const database = createContext().database();
    await assertFails(databaseRead(database, `${label}-read`));
    await assertFails(databaseWrite(database, `${label}-write`));
  });
});
