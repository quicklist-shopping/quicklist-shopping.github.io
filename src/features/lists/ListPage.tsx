import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, IconButton, InputAdornment, List as MaterialList, Paper, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import type { User } from 'firebase/auth';
import { useList } from './useList';
import { ItemRow } from './ItemRow';
import { ListErrorDialog } from './ListErrorDialog';
import { ShareListButton } from './ShareListButton';

export function ListPage({ listId, user, online }: { listId: string; user: User; online: boolean }) {
  const { list, status, error, addItem, removeItem, cycleItem } = useList(listId, user);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasInputFocusedRef = useRef(false);
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
    if (event.target === inputRef.current && event.key === 'Enter' && !event.nativeEvent.isComposing) {
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
      <Paper className="list-card" elevation={0}>
        <ShareListButton />
        <form onSubmit={submit}>
          <TextField
            label="Add item"
            value={newItem}
            inputRef={inputRef}
            onChange={(event) => setNewItem(event.target.value)}
            onKeyDown={handleInputKeyDown}
            variant="outlined"
            size="small"
            fullWidth
            slotProps={{
              htmlInput: { maxLength: 200, 'aria-label': 'Add item' },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      type="submit"
                      aria-label="Add item to list"
                      className="add-item-button"
                      disabled={!online || saving || !newItem.trim()}
                      onPointerDown={() => {
                        wasInputFocusedRef.current = document.activeElement === inputRef.current;
                      }}
                      onClick={() => {
                        // Refocus during the click gesture, not after the async write:
                        // mobile browsers may reject a later attempt to open the keyboard.
                        if (wasInputFocusedRef.current) inputRef.current?.focus();
                        wasInputFocusedRef.current = false;
                      }}
                    >
                      {saving ? <CircularProgress size={20} color="inherit" /> : <AddIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            disabled={!online}
          />
        </form>
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
      </Paper>
    </section>
  );
}
