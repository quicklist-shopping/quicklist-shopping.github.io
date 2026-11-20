import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  cycleItemState,
  fetchListFromServer,
  StaleItemStateError,
  subscribeToList,
  type QuickList,
} from '../../services/firebase/lists';
import { useList } from './useList';

vi.mock('../../services/firebase/lists', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/firebase/lists')>()),
  cycleItemState: vi.fn(),
  fetchListFromServer: vi.fn(),
  subscribeToList: vi.fn(),
}));

const user = { uid: 'test-user' } as User;
const original: QuickList = {
  id: 'shopping',
  items: [{ id: 'milk', name: 'Milk', state: 'UNKNOWN', updatedAt: new Timestamp(1, 0) }],
};
const latest: QuickList = {
  id: 'shopping',
  items: [
    { id: 'milk', name: 'Milk', state: 'IN_CART', updatedAt: new Timestamp(2, 0) },
    { id: 'tea', name: 'Tea', state: 'UNKNOWN', updatedAt: new Timestamp(3, 0) },
  ],
};
let onList: (list: QuickList | null) => void;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(subscribeToList).mockImplementation((_id, onChange) => {
    onList = onChange;
    return vi.fn();
  });
});

describe('refresh after a stale status write', () => {
  it('silently fetches the whole list from the server and does not repeat the write', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new StaleItemStateError());
    vi.mocked(fetchListFromServer).mockResolvedValue(latest);
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));

    await act(async () => result.current.cycleItem(original.items[0]));

    expect(cycleItemState).toHaveBeenCalledExactlyOnceWith('shopping', original.items[0], user.uid);
    expect(fetchListFromServer).toHaveBeenCalledExactlyOnceWith('shopping');
    expect(result.current.list).toEqual(latest);
    expect(result.current.status).toBe('ready');
  });

  it('also refreshes after transaction contention exhausts Firestore retries', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new FirebaseError('aborted', 'transaction contention'));
    vi.mocked(fetchListFromServer).mockResolvedValue(latest);
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));

    await act(async () => result.current.cycleItem(original.items[0]));
    expect(fetchListFromServer).toHaveBeenCalledOnce();
    expect(result.current.list).toEqual(latest);
  });

  it('does not replay a listener state received while reloading', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new StaleItemStateError());
    let finishReload!: (list: QuickList) => void;
    vi.mocked(fetchListFromServer).mockImplementation(() => new Promise((resolve) => { finishReload = resolve; }));
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));

    let transition!: Promise<void>;
    await act(async () => {
      transition = result.current.cycleItem(original.items[0]);
      await Promise.resolve();
    });
    act(() => onList(original));
    await act(async () => {
      finishReload(latest);
      await transition;
    });
    expect(result.current.list).toEqual(latest);
  });

  it('propagates a real server-read failure instead of silently claiming success', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new StaleItemStateError());
    vi.mocked(fetchListFromServer).mockRejectedValue(new Error('Server unreachable'));
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));
    await expect(result.current.cycleItem(original.items[0])).rejects.toThrow('Server unreachable');
  });
});
