import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  addItem as addItemToFirestore,
  cycleItemState,
  fetchListFromServer,
  StaleItemStateError,
  removeItem as removeItemFromFirestore,
  subscribeToList,
  type ListItem,
  type QuickList,
} from '../../services/firebase/lists';

export type ListStatus = 'loading' | 'ready' | 'not-found' | 'error';

export function useList(listId: string, user: User) {
  const [list, setList] = useState<QuickList | null>(null);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [error, setError] = useState('');
  const subscriptionVersion = useRef(0);
  const refreshVersion = useRef(0);

  useEffect(() => {
    const version = ++subscriptionVersion.current;
    setList(null);
    setStatus('loading');
    setError('');
    const unsubscribe = subscribeToList(
      listId,
      (nextList) => {
        if (subscriptionVersion.current !== version || refreshVersion.current > 0) return;
        setList(nextList);
        setStatus(nextList ? 'ready' : 'not-found');
      },
      (reason) => {
        if (subscriptionVersion.current !== version) return;
        setError(reason.message || 'Unable to load this list.');
        setStatus('error');
      },
    );
    return () => {
      ++subscriptionVersion.current;
      refreshVersion.current = 0;
      unsubscribe();
    };
  }, [listId]);

  const cycleItem = async (item: ListItem) => {
    const version = subscriptionVersion.current;
    try {
      await cycleItemState(listId, item, user.uid);
    } catch (reason) {
      if (!(reason instanceof StaleItemStateError)
        && !(reason instanceof FirebaseError && reason.code === 'aborted')) throw reason;
      // The old app handled a version conflict by fetching the whole list.
      // Do the same with a server-only read; don't show a conflict message.
      const refresh = ++refreshVersion.current;
      try {
        const latest = await fetchListFromServer(listId);
        if (subscriptionVersion.current === version && refreshVersion.current === refresh) {
          setList(latest);
          setStatus(latest ? 'ready' : 'not-found');
        }
      } finally {
        if (refreshVersion.current === refresh) refreshVersion.current = 0;
      }
    }
  };

  return {
    list,
    status,
    error,
    addItem: (name: string) => addItemToFirestore(listId, user.uid, name),
    removeItem: (itemId: string) => removeItemFromFirestore(listId, itemId, user.uid),
    cycleItem,
  };
}
