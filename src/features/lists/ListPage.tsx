import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, List as MaterialList, TextField } from '@mui/material';
import type { User } from 'firebase/auth';
import { useList } from './useList';
import { ItemRow } from './ItemRow';
import { ListErrorDialog } from './ListErrorDialog';

export function ListPage({ listId, user, online }: { listId: string; user: User; online: boolean }) {
  const { list, status, error, addItem, removeItem, cycleItem } = useList(listId, user);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const submittingRef = useRef(false);
  const navigate = useNavigate();

  const addCurrentItem = async () => {
    if (submittingRef.current || !online) return;
    const draft = newItem;
    const value = draft.trim();
    if (!value) {
      setNewItem('');
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setActionError('');
    try {
      await addItem(value);
      setNewItem((current) => current === draft ? '' : current);
    } catch {
      setActionError('Unable to add this item. Check your connection and try again.');
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void addCurrentItem();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void addCurrentItem();
    }
  };

  if (status === 'loading') return <CircularProgress color="secondary" sx={{ mt: 2 }} aria-label="Loading list" />;
  if (status === 'not-found') {
    return <ListErrorDialog message="List not found." onClose={() => navigate('/')} />;
  }
  if (status === 'error') {
    return <ListErrorDialog message={error || 'Unable to open this list.'} onClose={() => navigate('/')} />;
  }
  if (!list) return null;

  return (
    <section className="list-content" aria-label="Shopping list">
      <form onSubmit={(event) => void submit(event)}>
        <TextField
          label="Add item"
          value={newItem}
          onChange={(event) => setNewItem(event.target.value)}
          onKeyDown={handleInputKeyDown}
          variant="standard"
          fullWidth
          inputProps={{ maxLength: 200, 'aria-label': 'Add item' }}
          disabled={!online}
        />
      </form>
      {saving && <CircularProgress color="secondary" size={24} sx={{ mt: 1 }} aria-label="Adding item" />}
      {actionError && <ListErrorDialog message={actionError} onClose={() => setActionError('')} />}
      {list.items.length > 0 && (
        <MaterialList component="nav" className="shopping-list" aria-label="List items">
          {list.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onCycle={cycleItem}
              onRemove={removeItem}
              onError={setActionError}
              disabled={!online}
            />
          ))}
        </MaterialList>
      )}
    </section>
  );
}
