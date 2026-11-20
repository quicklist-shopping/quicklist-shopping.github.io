import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import {
  addItem as addItemToFirestore,
  cycleItemState,
  StaleItemStateError,
  removeItem as removeItemFromFirestore,
  subscribeToList,
  type ListItem,
  type ListSubscription,
  type QuickList,
} from '../../services/firebase/lists';

export type ListStatus = 'loading' | 'ready' | 'not-found' | 'error';

export function useList(listId: string, user: User) {
  const [list, setList] = useState<QuickList | null>(null);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [error, setError] = useState('');
  const subscriptionRef = useRef<{ listId: string; subscription: ListSubscription } | null>(null);

  useEffect(() => {
    setList(null);
    setStatus('loading');
    setError('');
    const subscription = subscribeToList(
      listId,
      (nextList) => {
        setList(nextList);
        setStatus(nextList ? 'ready' : 'not-found');
      },
      (reason) => {
        setError(reason.message || 'Unable to load this list.');
        setStatus('error');
      },
    );
    subscriptionRef.current = { listId, subscription };
    return () => {
      subscription.unsubscribe();
      if (subscriptionRef.current?.subscription === subscription) subscriptionRef.current = null;
    };
  }, [listId]);

  const cycleItem = async (item: ListItem) => {
    try {
      await cycleItemState(listId, item, user.uid);
    } catch (reason) {
      if (!(reason instanceof StaleItemStateError)
        && !(reason instanceof FirebaseError && reason.code === 'aborted')) throw reason;
      // A stale write is silently dropped. Use the same serialized, full-list
      // server refresh as the live listener; never replay the failed change.
      if (subscriptionRef.current?.listId === listId) {
        await subscriptionRef.current.subscription.refresh();
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
