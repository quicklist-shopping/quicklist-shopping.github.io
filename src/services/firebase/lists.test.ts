import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

const { runTransactionMock, onSnapshotMock, getDocFromServerMock, getDocsFromServerMock, waitForPendingWritesMock, updates, listeners } = vi.hoisted(() => ({
  runTransactionMock: vi.fn(),
  onSnapshotMock: vi.fn(),
  getDocFromServerMock: vi.fn(),
  getDocsFromServerMock: vi.fn(),
  waitForPendingWritesMock: vi.fn(),
  updates: [] as Array<{ state?: string }>,
  listeners: [] as Array<(snapshot: unknown) => void>,
}));

vi.mock('./client', () => ({ db: {} }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: vi.fn((_database: unknown, ...parts: string[]) => parts.join('/')),
  collection: vi.fn((_database: unknown, ...parts: string[]) => parts.join('/')),
  query: vi.fn((ref: unknown) => ref),
  onSnapshot: onSnapshotMock,
  getDocFromServer: getDocFromServerMock,
  getDocsFromServer: getDocsFromServerMock,
  waitForPendingWrites: waitForPendingWritesMock,
  runTransaction: runTransactionMock,
}));

import { cycleItemState, fetchListFromServer, StaleItemStateError, subscribeToList, type ListItem } from './lists';

const server = { fromCache: false, hasPendingWrites: false };
const parent = (revision: number) => ({
  metadata: server,
  exists: () => true,
  data: () => ({ schemaVersion: 1, updatedAt: new Timestamp(revision, 0) }),
});
const itemDocs = (state: string, revision: number) => ({
  metadata: server,
  docs: [{ id: 'milk', data: () => ({ name: 'Milk', state, updatedAt: new Timestamp(revision, 0) }) }],
});

beforeEach(() => {
  runTransactionMock.mockReset();
  onSnapshotMock.mockReset();
  getDocFromServerMock.mockReset();
  getDocsFromServerMock.mockReset();
  waitForPendingWritesMock.mockReset().mockResolvedValue(undefined);
  onSnapshotMock.mockImplementation((_reference: unknown, _options: unknown, next: (snapshot: unknown) => void) => {
    listeners.push(next);
    return vi.fn();
  });
  updates.length = 0;
  listeners.length = 0;
});

function serverItem(initial: ListItem) {
  let stored = { state: initial.state as string, updatedAt: initial.updatedAt };
  runTransactionMock.mockImplementation(async (_db: unknown, callback: (transaction: unknown) => Promise<void>) => {
    await callback({
      get: async () => ({ exists: () => true, data: () => stored }),
      update: (_ref: unknown, changes: { state?: string }) => { updates.push(changes); },
    });
    const next = updates.at(-2);
    if (next?.state) stored = { state: next.state, updatedAt: new Timestamp(stored.updatedAt!.seconds + 1, 0) };
  });
  return () => stored;
}

describe('concurrent status updates', () => {
  it('does not turn two clicks on the same observed status into two transitions', async () => {
    const observed: ListItem = { id: 'milk', name: 'Milk', state: 'UNKNOWN', updatedAt: new Timestamp(1, 0) };
    const current = serverItem(observed);

    await cycleItemState('shopping', observed, 'user-1');
    expect(current().state).toBe('IN_CART');
    await expect(cycleItemState('shopping', observed, 'user-2')).rejects.toBeInstanceOf(StaleItemStateError);
    expect(current().state).toBe('IN_CART');
    expect(updates).toHaveLength(2); // Only one item and one list write.

    await cycleItemState('shopping', { ...observed, state: 'IN_CART', updatedAt: current().updatedAt }, 'user-2');
    expect(current().state).toBe('UNAVAILABLE');
  });

  it('treats parent revisions as notifications and fetches every item together', async () => {
    const onList = vi.fn();
    const onError = vi.fn();
    getDocFromServerMock.mockResolvedValue(parent(1));
    getDocsFromServerMock.mockResolvedValue(itemDocs('IN_CART', 1));
    const subscription = subscribeToList('shopping', onList, onError);
    expect(listeners).toHaveLength(1); // No independent item listener.

    listeners[0]({ ...parent(1), metadata: { fromCache: true, hasPendingWrites: false } });
    listeners[0]({ ...parent(1), metadata: { fromCache: false, hasPendingWrites: true } });
    expect(getDocFromServerMock).not.toHaveBeenCalled();

    listeners[0](parent(1));
    await vi.waitFor(() => expect(onList).toHaveBeenCalledOnce());
    expect(onList.mock.lastCall?.[0].items[0].state).toBe('IN_CART');
    listeners[0](parent(1));
    expect(onList).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('discards a completed read when another parent update arrives mid-refresh', async () => {
    const onList = vi.fn();
    const onError = vi.fn();
    let finishFirst!: (items: ReturnType<typeof itemDocs>) => void;
    getDocFromServerMock.mockResolvedValueOnce(parent(1)).mockResolvedValueOnce(parent(1))
      .mockResolvedValue(parent(2));
    getDocsFromServerMock.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValue(itemDocs('UNAVAILABLE', 2));
    const subscription = subscribeToList('shopping', onList, onError);
    listeners[0](parent(1));
    await vi.waitFor(() => expect(getDocsFromServerMock).toHaveBeenCalledOnce());
    listeners[0](parent(2));
    finishFirst(itemDocs('IN_CART', 1));
    await vi.waitFor(() => expect(onList).toHaveBeenCalledOnce());
    expect(onList.mock.lastCall?.[0].items[0].state).toBe('UNAVAILABLE');
    expect(getDocsFromServerMock).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('refreshes on focus even when the listener missed an update', async () => {
    const onList = vi.fn();
    getDocFromServerMock.mockResolvedValueOnce(parent(1)).mockResolvedValueOnce(parent(1))
      .mockResolvedValue(parent(2));
    getDocsFromServerMock.mockResolvedValueOnce(itemDocs('UNKNOWN', 1))
      .mockResolvedValue(itemDocs('IN_CART', 2));
    const subscription = subscribeToList('shopping', onList, vi.fn());
    listeners[0](parent(1));
    await vi.waitFor(() => expect(onList).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(onList).toHaveBeenCalledTimes(2));
    expect(onList.mock.lastCall?.[0].items[0].state).toBe('IN_CART');
    subscription.unsubscribe();
  });

  it('retries rapidly changing lists without showing a conflict or dropping the reload', async () => {
    const onList = vi.fn();
    const onError = vi.fn();
    let parentReads = 0;
    getDocFromServerMock.mockImplementation(async () => {
      const read = parentReads++;
      return parent(read < 10 ? (read % 2 === 0 ? 1 : 2) : 3);
    });
    getDocsFromServerMock.mockResolvedValue(itemDocs('IN_CART', 3));
    const subscription = subscribeToList('shopping', onList, onError);
    await subscription.refresh();
    expect(onList).toHaveBeenCalledOnce();
    expect(onList.mock.lastCall?.[0].items[0].state).toBe('IN_CART');
    expect(getDocsFromServerMock).toHaveBeenCalledTimes(6);
    expect(onError).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('recovers from a stalled mobile request without freezing subsequent refreshes', async () => {
    vi.useFakeTimers();
    const onList = vi.fn();
    const onError = vi.fn();
    getDocFromServerMock.mockResolvedValue(parent(1));
    getDocsFromServerMock.mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue(itemDocs('IN_CART', 1));
    const subscription = subscribeToList('shopping', onList, onError);
    try {
      const first = expect(subscription.refresh()).rejects.toThrow('Unable to refresh');
      await vi.advanceTimersByTimeAsync(15000);
      await first;
      await subscription.refresh();
      expect(onList.mock.lastCall?.[0].items[0].state).toBe('IN_CART');
      expect(onError).toHaveBeenCalledOnce();
    } finally {
      subscription.unsubscribe();
      vi.useRealTimers();
    }
  });

  it('revalidates periodically while visible, and stops after unsubscribe', async () => {
    vi.useFakeTimers();
    getDocFromServerMock.mockResolvedValue(parent(1));
    getDocsFromServerMock.mockResolvedValue(itemDocs('IN_CART', 1));
    const subscription = subscribeToList('shopping', vi.fn(), vi.fn());
    try {
      await subscription.refresh();
      expect(getDocsFromServerMock).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(60000);
      expect(getDocsFromServerMock).toHaveBeenCalledTimes(2);
      subscription.unsubscribe();
      await vi.advanceTimersByTimeAsync(60000);
      expect(getDocsFromServerMock).toHaveBeenCalledTimes(2);
    } finally {
      subscription.unsubscribe();
      vi.useRealTimers();
    }
  });

  it('fetches the whole list directly from the server on refresh', async () => {
    getDocFromServerMock.mockResolvedValue(parent(2));
    getDocsFromServerMock.mockResolvedValue({
      metadata: server,
      docs: [
        { id: 'milk', data: () => ({ name: 'Milk', state: 'IN_CART', updatedAt: new Timestamp(2, 0) }) },
        { id: 'tea', data: () => ({ name: 'Tea', state: 'UNKNOWN', updatedAt: new Timestamp(3, 0) }) },
      ],
    });
    const list = await fetchListFromServer('shopping');
    expect(getDocFromServerMock).toHaveBeenCalledTimes(2);
    expect(getDocsFromServerMock).toHaveBeenCalledOnce();
    expect(list?.items.map((item) => item.name)).toEqual(['Milk', 'Tea']);
    expect(list?.items[0].state).toBe('IN_CART');
  });

  it('retries when the list changes while items are being read', async () => {
    getDocFromServerMock.mockResolvedValueOnce(parent(1)).mockResolvedValueOnce(parent(2))
      .mockResolvedValue(parent(2));
    getDocsFromServerMock.mockResolvedValueOnce(itemDocs('UNKNOWN', 1))
      .mockResolvedValue(itemDocs('IN_CART', 2));
    const list = await fetchListFromServer('shopping');
    expect(list?.items[0].state).toBe('IN_CART');
    expect(getDocsFromServerMock).toHaveBeenCalledTimes(2);
  });

  it('waits for local writes before accepting a server read', async () => {
    getDocFromServerMock.mockResolvedValueOnce({
      ...parent(1), metadata: { fromCache: false, hasPendingWrites: true },
    }).mockResolvedValue(parent(2));
    getDocsFromServerMock.mockResolvedValue(itemDocs('IN_CART', 2));
    const list = await fetchListFromServer('shopping');
    expect(waitForPendingWritesMock).toHaveBeenCalledOnce();
    expect(list?.items[0].state).toBe('IN_CART');
    expect(getDocsFromServerMock).toHaveBeenCalledOnce();
  });

  it('does not fetch items when the parent list has disappeared', async () => {
    getDocFromServerMock.mockResolvedValue({ exists: () => false });
    expect(await fetchListFromServer('missing')).toBeNull();
    expect(getDocsFromServerMock).not.toHaveBeenCalled();
  });

  it('rejects a stale revision even if the status has cycled back to the same value', async () => {
    const observed: ListItem = { id: 'milk', name: 'Milk', state: 'UNKNOWN', updatedAt: new Timestamp(1, 0) };
    const current = serverItem(observed);
    await cycleItemState('shopping', observed, 'user-1');
    await cycleItemState('shopping', { ...observed, state: 'IN_CART', updatedAt: current().updatedAt }, 'user-1');
    await cycleItemState('shopping', { ...observed, state: 'UNAVAILABLE', updatedAt: current().updatedAt }, 'user-1');
    expect(current().state).toBe('UNKNOWN');

    await expect(cycleItemState('shopping', observed, 'user-2')).rejects.toBeInstanceOf(StaleItemStateError);
    expect(current().state).toBe('UNKNOWN');
  });
});
