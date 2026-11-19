import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

const { runTransactionMock, onSnapshotMock, updates, listeners } = vi.hoisted(() => ({
  runTransactionMock: vi.fn(),
  onSnapshotMock: vi.fn(),
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
  runTransaction: runTransactionMock,
}));

import { cycleItemState, StaleItemStateError, subscribeToList, type ListItem } from './lists';

beforeEach(() => {
  runTransactionMock.mockReset();
  onSnapshotMock.mockReset();
  onSnapshotMock.mockImplementation((_reference: unknown, next: (snapshot: unknown) => void) => {
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

  it('does not replay old item states when only the parent activity timestamp changes', () => {
    const onList = vi.fn();
    const onError = vi.fn();
    const unsubscribe = subscribeToList('shopping', onList, onError);
    expect(listeners).toHaveLength(2);

    listeners[0]({ exists: () => true, data: () => ({ schemaVersion: 1 }) });
    listeners[1]({ docs: [{ id: 'milk', data: () => ({ name: 'Milk', state: 'UNKNOWN', updatedAt: new Timestamp(1, 0) }) }] });
    expect(onList).toHaveBeenCalledTimes(1);

    listeners[0]({ exists: () => true, data: () => ({ schemaVersion: 1 }) });
    expect(onList).toHaveBeenCalledTimes(1);

    listeners[1]({ docs: [{ id: 'milk', data: () => ({ name: 'Milk', state: 'IN_CART', updatedAt: new Timestamp(2, 0) }) }] });
    expect(onList).toHaveBeenCalledTimes(2);
    expect(onList.mock.lastCall?.[0].items[0].state).toBe('IN_CART');
    expect(onError).not.toHaveBeenCalled();
    unsubscribe();
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
