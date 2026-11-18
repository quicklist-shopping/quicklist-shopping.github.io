import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, IconButton, Tooltip } from '@mui/material';
import FiberNewIcon from '@mui/icons-material/FiberNew';
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
      <Tooltip title="Create a new list">
        <span>
          <IconButton color="secondary" aria-label="Create a new list" onClick={create} disabled={busy || !online} size="large">
            {busy ? <CircularProgress size={28} color="secondary" /> : <FiberNewIcon fontSize="large" />}
          </IconButton>
        </span>
      </Tooltip>
      {error && <ListErrorDialog message={error} onClose={() => setError('')} />}
    </>
  );
}
