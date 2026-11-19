import {
  collection,
  doc,
  documentId,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type Unsubscribe,
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
    super('Another person changed this item. Wait for its latest status, then tap again.');
    this.name = 'StaleItemStateError';
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

export function subscribeToList(
  listId: string,
  onList: (list: QuickList | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = firestore();
  const listRef = doc(database, 'lists', listId);
  const itemsQuery = query(
    collection(listRef, 'items'),
    orderBy('createdAt', 'asc'),
    orderBy(documentId(), 'asc'),
  );

  let metadata: { exists: boolean; valid: boolean } | undefined;
  let items: ListItem[] | undefined;
  let finished = false;

  const emitStatus = () => {
    if (finished || !metadata) return;
    if (!metadata.exists) {
      onList(null);
    } else if (!metadata.valid) {
      onError(new Error('This list has an unsupported or invalid format.'));
    }
  };

  const emitItems = () => {
    if (finished || !metadata || !metadata.exists || !metadata.valid || !items) return;
    onList({ id: listId, items });
  };

  const unsubscribeList = onSnapshot(
    listRef,
    (snapshot) => {
      const firstParentSnapshot = metadata === undefined;
      const data = snapshot.data();
      metadata = {
        exists: snapshot.exists(),
        valid: !snapshot.exists() || data?.schemaVersion === 1,
      };
      emitStatus();
      // Parent activity timestamps can arrive before their item updates. Do
      // not re-emit the last items snapshot on every parent update.
      if (firstParentSnapshot) emitItems();
    },
    (error) => onError(error),
  );

  const unsubscribeItems = onSnapshot(
    itemsQuery,
    (snapshot) => {
      try {
        items = snapshot.docs.map((itemDoc) => {
          const data = itemDoc.data();
          if (typeof data.name !== 'string' || !isItemState(data.state)
            || (data.updatedAt !== null && !(data.updatedAt instanceof Timestamp))) {
            throw new Error('This list contains an invalid item.');
          }
          return { id: itemDoc.id, name: data.name, state: data.state, updatedAt: data.updatedAt };
        });
        emitItems();
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Unable to read list items.'));
      }
    },
    (error) => onError(error),
  );

  return () => {
    finished = true;
    unsubscribeList();
    unsubscribeItems();
  };
}

