import { useState } from 'react';
import { CircularProgress, IconButton, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HelpIcon from '@mui/icons-material/Help';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import type { ListItem as ListItemModel } from '../../services/firebase/lists';

interface ItemRowProps {
  item: ListItemModel;
  onCycle: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onError: (message: string) => void;
  disabled: boolean;
}

const stateIcon = {
  UNKNOWN: <HelpIcon />,
  IN_CART: <CheckCircleIcon />,
  UNAVAILABLE: <ErrorIcon />,
} as const;

export function ItemRow({ item, onCycle, onRemove, onError, disabled }: ItemRowProps) {
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch {
      onError('Unable to update this item. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ListItem
      disablePadding
      className={`quicklist-item${item.state === 'IN_CART' ? ' quicklist-item--in-cart' : ''}${item.state === 'UNAVAILABLE' ? ' quicklist-item--unavailable' : ''}`}
      secondaryAction={
        <IconButton
          edge="end"
          aria-label={`Remove ${item.name}`}
          disabled={busy || disabled}
          onClick={() => void run(() => onRemove(item.id))}
        >
          <HighlightOffIcon fontSize="large" />
        </IconButton>
      }
    >
      <ListItemButton
        onClick={() => void run(() => onCycle(item.id))}
        disabled={busy || disabled}
        aria-label={`${item.name}, ${item.state.toLowerCase().replace('_', ' ')}`}
      >
        <ListItemIcon>
          {busy ? <CircularProgress size={25} color="secondary" /> : stateIcon[item.state]}
        </ListItemIcon>
        <ListItemText primary={item.name} />
      </ListItemButton>
    </ListItem>
  );
}
