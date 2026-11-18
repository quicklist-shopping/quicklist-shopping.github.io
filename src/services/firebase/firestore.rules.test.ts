import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

const approvedEmail = 'approved@example.com';
const rulesEmulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let testEnv: RulesTestEnvironment;

function googleUser(email: string, verified = true, provider: 'google.com' | 'password' = 'google.com') {
  return testEnv.authenticatedContext(email, {
    email,
    email_verified: verified,
    firebase: { sign_in_provider: provider },
  }).firestore();
}

function newListData(uid: string) {
  return {
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  };
}

describe.skipIf(!rulesEmulatorAvailable)('Firestore authorization and validation rules', () => {
  beforeAll(async () => {
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
    const productionRules = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const allowlistPattern = /request\.auth\.token\.email\s+in\s+\[[^\]]*\]/;
    expect(productionRules).toMatch(allowlistPattern);
    const testRules = productionRules.replace(
      allowlistPattern,
      `request.auth.token.email in ['${approvedEmail}']`,
    );

    testEnv = await initializeTestEnvironment({
      projectId: 'demo-quicklist',
      firestore: { host, port: Number(port), rules: testRules },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('allows only the configured, verified Google account to create and read a list', async () => {
    const approvedDb = googleUser(approvedEmail);
    const listRef = doc(approvedDb, 'lists', 'shared-list');
    await assertSucceeds(setDoc(listRef, newListData(approvedEmail)));
    await assertSucceeds(getDoc(listRef));

    await assertFails(getDoc(doc(googleUser('stranger@example.com'), 'lists', 'shared-list')));
    await assertFails(getDoc(doc(googleUser(approvedEmail, false), 'lists', 'shared-list')));
    await assertFails(getDoc(doc(googleUser(approvedEmail, true, 'password'), 'lists', 'shared-list')));
  });

  it('denies collection-wide list discovery and invalid list documents', async () => {
    const approvedDb = googleUser(approvedEmail);
    await assertFails(getDocs(collection(approvedDb, 'lists')));
    await assertFails(setDoc(doc(approvedDb, 'lists', 'bad-schema'), {
      ...newListData(approvedEmail),
      secret: 'not allowed',
    }));
    await assertFails(setDoc(doc(approvedDb, 'lists', 'spoofed-owner'), newListData('someone-else')));
  });

  it('requires item changes and parent activity timestamp to be atomic', async () => {
    const approvedDb = googleUser(approvedEmail);
    const listRef = doc(approvedDb, 'lists', 'shopping');
    await assertSucceeds(setDoc(listRef, newListData(approvedEmail)));

    const itemRef = doc(collection(listRef, 'items'), 'milk');
    await assertFails(setDoc(itemRef, {
      name: 'Milk', state: 'UNKNOWN', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      createdBy: approvedEmail, updatedBy: approvedEmail,
    }));

    const createBatch = writeBatch(approvedDb);
    createBatch.set(itemRef, {
      name: 'Milk', state: 'UNKNOWN', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      createdBy: approvedEmail, updatedBy: approvedEmail,
    });
    createBatch.update(listRef, { updatedAt: serverTimestamp(), updatedBy: approvedEmail });
    await assertSucceeds(createBatch.commit());

    const updateBatch = writeBatch(approvedDb);
    updateBatch.update(itemRef, {
      state: 'IN_CART', updatedAt: serverTimestamp(), updatedBy: approvedEmail,
    });
    updateBatch.update(listRef, { updatedAt: serverTimestamp(), updatedBy: approvedEmail });
    await assertSucceeds(updateBatch.commit());

    const invalidBatch = writeBatch(approvedDb);
    invalidBatch.update(itemRef, {
      state: 'BROKEN', updatedAt: serverTimestamp(), updatedBy: approvedEmail,
    });
    invalidBatch.update(listRef, { updatedAt: serverTimestamp(), updatedBy: approvedEmail });
    await assertFails(invalidBatch.commit());
  });
});
