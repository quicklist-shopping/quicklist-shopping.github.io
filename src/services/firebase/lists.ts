import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  waitForPendingWrites,
  writeBatch,
} from 'firebase/firestore';
import { db } from './client';

export type ItemState = 'UNKNOWN' | 'IN_CART' | 'UNAVAILABLE';

export interface ListItem {
  id: string;
  name: string;
  state: ItemState;
  // The server timestamp acts as an optimistic-locking revision. Null only while
  // the initial local write is pending; an item cannot be changed until it resolves.
  updatedAt: Timestamp | null;
}

export class StaleItemStateError extends Error {
  constructor() {
    super('The item revision is no longer current.');
    this.name = 'StaleItemStateError';
  }
}

class ConcurrentRefreshError extends Error {
  constructor() {
    super('Unable to refresh the list right now. Try again.');
  }
}

export interface QuickList {
  id: string;
  items: ListItem[];
}

const nextState: Record<ItemState, ItemState> = {
  UNKNOWN: 'IN_CART',
  IN_CART: 'UNAVAILABLE',
  UNAVAILABLE: 'UNKNOWN',
};

function firestore() {
  if (!db) throw new Error('Firebase is not configured.');
  return db;
}

export async function createList(uid: string): Promise<string> {
  const database = firestore();
  const listRef = doc(collection(database, 'lists'));
  await setDoc(listRef, {
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  return listRef.id;
}

export async function addItem(listId: string, uid: string, name: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 200) throw new Error('Item names must be 1–200 characters.');
  const database = firestore();
  const listRef = doc(database, 'lists', listId);
  const itemRef = doc(collection(listRef, 'items'));
  const batch = writeBatch(database);
  batch.set(itemRef, {
    name: cleanName,
    state: 'UNKNOWN',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    updatedBy: uid,
  });
  batch.update(listRef, { updatedAt: serverTimestamp(), updatedBy: uid });
  await batch.commit();
}

export async function removeItem(listId: string, itemId: string, uid: string): Promise<void> {
  const database = firestore();
  const listRef = doc(database, 'lists', listId);
  const itemRef = doc(listRef, 'items', itemId);
  const batch = writeBatch(database);
  batch.delete(itemRef);
  batch.update(listRef, { updatedAt: serverTimestamp(), updatedBy: uid });
  await batch.commit();
}

export async function cycleItemState(listId: string, item: ListItem, uid: string): Promise<void> {
  const database = firestore();
  const listRef = doc(database, 'lists', listId);
  const itemRef = doc(listRef, 'items', item.id);

  if (!item.updatedAt) throw new StaleItemStateError();

  await runTransaction(database, async (transaction) => {
    const itemSnapshot = await transaction.get(itemRef);
    if (!itemSnapshot.exists()) throw new StaleItemStateError();

    const currentState = itemSnapshot.data().state as ItemState;
    const currentRevision = itemSnapshot.data().updatedAt;
    // A transaction automatically retries on a concurrent write. On retry,
    // reject a stale click rather than applying another state transition.
    if (currentState !== item.state || !(currentRevision instanceof Timestamp)
      || !currentRevision.isEqual(item.updatedAt!)) {
      throw new StaleItemStateError();
    }
    if (!(currentState in nextState)) throw new Error('This item has an invalid state.');
    transaction.update(itemRef, {
      state: nextState[currentState],
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
    transaction.update(listRef, { updatedAt: serverTimestamp(), updatedBy: uid });
  });
}

function isItemState(value: unknown): value is ItemState {
  return value === 'UNKNOWN' || value === 'IN_CART' || value === 'UNAVAILABLE';
}

function readItem(id: string, data: Record<string, unknown>): ListItem {
  if (typeof data.name !== 'string' || !isItemState(data.state)
    || (data.updatedAt !== null && !(data.updatedAt instanceof Timestamp))) {
    throw new Error('This list contains an invalid item.');
  }
  return { id, name: data.name, state: data.state, updatedAt: data.updatedAt };
}

function listItemsQuery(listId: string) {
  return query(
    collection(firestore(), 'lists', listId, 'items'),
    orderBy('createdAt', 'asc'),
    orderBy(documentId(), 'asc'),
  );
}

// Every item write also changes the parent list's updatedAt. Read the parent
// again after the query so a concurrent edit cannot produce a mixed-version
// list (new parent plus old items, or vice versa).
export async function fetchListFromServer(listId: string): Promise<QuickList | null> {
  const listRef = doc(firestore(), 'lists', listId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await getDocFromServer(listRef);
    if (!before.exists()) return null;
    if (before.data().schemaVersion !== 1) throw new Error('This list has an unsupported or invalid format.');
    if (before.metadata.hasPendingWrites) {
      await waitForPendingWrites(firestore());
      continue;
    }
    const items = await getDocsFromServer(listItemsQuery(listId));
    const after = await getDocFromServer(listRef);
    if (!after.exists()) return null;
    if (after.metadata.hasPendingWrites || items.metadata.hasPendingWrites) {
      await waitForPendingWrites(firestore());
      continue;
    }
    const firstRevision = before.data().updatedAt;
    const lastRevision = after.data().updatedAt;
    if (firstRevision instanceof Timestamp && lastRevision instanceof Timestamp
      && firstRevision.isEqual(lastRevision)) {
      return { id: listId, items: items.docs.map((item) => readItem(item.id, item.data())) };
    }
  }
  throw new ConcurrentRefreshError();
}

export interface ListSubscription {
  refresh: () => Promise<void>;
  unsubscribe: () => void;
}

// The parent document is the change notification. Its activity timestamp is
// updated in the same atomic write as every item, so we then fetch *all* items
// from the server, rather than composing two independent listener snapshots.
export function subscribeToList(
  listId: string,
  onList: (list: QuickList | null) => void,
  onError: (error: Error) => void,
): ListSubscription {
  const listRef = doc(firestore(), 'lists', listId);
  let disposed = false;
  let running = false;
  let queued = false;
  let concurrentReadRetries = 0;
  let lastNotified: Timestamp | null | undefined;
  let loaded = false;
  let waiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  const settle = (error?: Error) => {
    const pending = waiters;
    waiters = [];
    for (const waiter of pending) {
      if (error) waiter.reject(error);
      else waiter.resolve();
    }
  };

  const withTimeout = async <T,>(request: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Unable to refresh the list. Check your connection.')), 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const drain = async () => {
    if (running || disposed) return;
    running = true;
    try {
      while (queued && !disposed) {
        queued = false;
        try {
          const list = await withTimeout(fetchListFromServer(listId));
          if (disposed) break;
          // If another update arrived mid-read, discard this result and read
          // again. Never present a snapshot that we already know is outdated.
          if (queued) continue;
          concurrentReadRetries = 0;
          loaded = true;
          onList(list);
          settle();
        } catch (reason) {
          if (disposed) break;
          // Continuous edits can invalidate several complete reads. Retry
          // quietly rather than treating an ordinary race as a user error.
          if (reason instanceof ConcurrentRefreshError && ++concurrentReadRetries < 3) {
            queued = true;
            continue;
          }
          concurrentReadRetries = 0;
          const error = reason instanceof Error ? reason : new Error('Unable to refresh the list.');
          loaded = false;
          onError(error);
          settle(error);
        }
      }
    } finally {
      running = false;
      if (queued && !disposed) void drain();
    }
  };

  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    queued = true;
    const pending = new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
    void drain();
    return pending;
  };

  const requestRefresh = () => { void refresh().catch(() => {}); };
  const onWake = () => { if (!document.hidden) requestRefresh(); };
  const unsubscribeParent = onSnapshot(
    listRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      const revision = snapshot.exists() ? snapshot.data().updatedAt : null;
      if (snapshot.exists() && !(revision instanceof Timestamp)) {
        onError(new Error('This list has an invalid revision.'));
        return;
      }
      if (loaded && lastNotified === null && revision === null) return;
      if (loaded && lastNotified instanceof Timestamp && revision instanceof Timestamp
        && lastNotified.isEqual(revision)) return;
      lastNotified = revision;
      requestRefresh();
    },
    (error) => {
      loaded = false;
      onError(error);
    },
  );
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', onWake);
  // A foreground tab also revalidates periodically if a mobile browser has
  // silently stopped delivering listener events without a focus/online event.
  const revalidate = setInterval(() => {
    if (!document.hidden && navigator.onLine) requestRefresh();
  }, 60000);

  return {
    refresh,
    unsubscribe: () => {
      disposed = true;
      unsubscribeParent();
      window.removeEventListener('focus', onWake);
      window.removeEventListener('online', onWake);
      document.removeEventListener('visibilitychange', onWake);
      clearInterval(revalidate);
      settle();
    },
  };
}

