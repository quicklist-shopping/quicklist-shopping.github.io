import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, CircularProgress, Tooltip } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import type { User } from 'firebase/auth';
import { createList } from '../../services/firebase/lists';
import { ListErrorDialog } from './ListErrorDialog';

export function NewListButton({ user, online }: { user: User; online: boolean }) {
  const navigate = useNavigate();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const id = await createList(user.uid);
      navigate(`/${id}`);
    } catch {
      setError('Could not create a list. Check your connection and try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip title="Start a new shopping list">
        <span>
          <Button
            className="new-list-button"
            variant="contained"
            color="secondary"
            aria-label="Create a new list"
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <AddRoundedIcon />}
            onClick={create}
            disabled={busy || !online}
          >
            {busy ? 'Creating…' : 'New list'}
          </Button>
        </span>
      </Tooltip>
      {error && <ListErrorDialog message={error} onClose={() => setError('')} />}
    </>
  );
}
