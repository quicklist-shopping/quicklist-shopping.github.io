import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  cycleItemState,
  StaleItemStateError,
  subscribeToList,
  type QuickList,
} from '../../services/firebase/lists';
import { useList } from './useList';

vi.mock('../../services/firebase/lists', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/firebase/lists')>()),
  cycleItemState: vi.fn(),
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
let refresh: Mock<() => Promise<void>>;

beforeEach(() => {
  vi.clearAllMocks();
  refresh = vi.fn(async () => onList(latest));
  vi.mocked(subscribeToList).mockImplementation((_id, onChange) => {
    onList = onChange;
    return { refresh, unsubscribe: vi.fn() };
  });
});

describe('refresh after a stale status write', () => {
  it('silently requests a serialized whole-list refresh and never repeats the write', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new StaleItemStateError());
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));

    await act(async () => result.current.cycleItem(original.items[0]));

    expect(cycleItemState).toHaveBeenCalledExactlyOnceWith('shopping', original.items[0], user.uid);
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.list).toEqual(latest);
    expect(result.current.status).toBe('ready');
  });

  it('also refreshes after transaction contention exhausts Firestore retries', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new FirebaseError('aborted', 'transaction contention'));
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));

    await act(async () => result.current.cycleItem(original.items[0]));
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.list).toEqual(latest);
  });

  it('continues to display live updates while a refresh is in flight', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new StaleItemStateError());
    let finishReload!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => { finishReload = resolve; }));
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));

    let transition!: Promise<void>;
    await act(async () => {
      transition = result.current.cycleItem(original.items[0]);
      await Promise.resolve();
    });
    act(() => onList(latest));
    expect(result.current.list).toEqual(latest);
    await act(async () => {
      finishReload();
      await transition;
    });
  });

  it('propagates a real server-read failure instead of silently claiming success', async () => {
    vi.mocked(cycleItemState).mockRejectedValue(new StaleItemStateError());
    refresh.mockRejectedValue(new Error('Server unreachable'));
    const { result } = renderHook(() => useList('shopping', user));
    act(() => onList(original));
    await expect(result.current.cycleItem(original.items[0])).rejects.toThrow('Server unreachable');
  });
});
