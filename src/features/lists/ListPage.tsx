import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, List as MaterialList, TextField, Typography } from '@mui/material';
import type { User } from 'firebase/auth';
import { useList } from './useList';
import { ItemRow } from './ItemRow';
import { ListErrorDialog } from './ListErrorDialog';

export function ListPage({ listId, user, online }: { listId: string; user: User; online: boolean }) {
  const { list, status, error, addItem, removeItem, cycleItem } = useList(listId, user);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const navigate = useNavigate();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = newItem.trim();
    if (saving) return;
    if (!value) {
      setNewItem('');
      return;
    }
    setSaving(true);
    setActionError('');
    try {
      await addItem(value);
      setNewItem('');
    } catch {
      setActionError('Unable to add this item. Check your connection and try again.');
    } finally {
      setSaving(false);
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
          variant="standard"
          fullWidth
          inputProps={{ maxLength: 200, 'aria-label': 'Add item' }}
          disabled={saving || !online}
        />
      </form>
      {saving && <CircularProgress color="secondary" size={24} sx={{ mt: 1 }} aria-label="Adding item" />}
      {actionError && <ListErrorDialog message={actionError} onClose={() => setActionError('')} />}
      {list.items.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
          Add an item to get started.
        </Typography>
      ) : (
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
