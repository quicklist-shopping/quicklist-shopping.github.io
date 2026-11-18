import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  addItem as addItemToFirestore,
  cycleItemState,
  removeItem as removeItemFromFirestore,
  subscribeToList,
  type QuickList,
} from '../../services/firebase/lists';

export type ListStatus = 'loading' | 'ready' | 'not-found' | 'error';

export function useList(listId: string, user: User) {
  const [list, setList] = useState<QuickList | null>(null);
  const [status, setStatus] = useState<ListStatus>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    setList(null);
    setStatus('loading');
    setError('');
    return subscribeToList(
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
  }, [listId]);

  return {
    list,
    status,
    error,
    addItem: (name: string) => addItemToFirestore(listId, user.uid, name),
    removeItem: (itemId: string) => removeItemFromFirestore(listId, itemId, user.uid),
    cycleItem: (itemId: string) => cycleItemState(listId, itemId, user.uid),
  };
}
