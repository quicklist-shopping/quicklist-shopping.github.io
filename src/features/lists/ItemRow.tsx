import { useState } from 'react';
import { CircularProgress, IconButton, ListItem, ListItemButton, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HelpIcon from '@mui/icons-material/Help';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import { StaleItemStateError, type ListItem as ListItemModel } from '../../services/firebase/lists';

interface ItemRowProps {
  item: ListItemModel;
  onCycle: (item: ListItemModel) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onError: (message: string) => void;
  onConflict: (message: string) => void;
  disabled: boolean;
}

const stateIcon = {
  UNKNOWN: <HelpIcon />,
  IN_CART: <CheckCircleIcon />,
  UNAVAILABLE: <ErrorIcon />,
} as const;

const stateLabel = {
  UNKNOWN: 'To buy',
  IN_CART: 'In cart',
  UNAVAILABLE: 'Unavailable',
} as const;

export function ItemRow({ item, onCycle, onRemove, onError, onConflict, disabled }: ItemRowProps) {
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      if (error instanceof StaleItemStateError) {
        onConflict(error.message);
      } else {
        onError('Unable to update this item. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <ListItem
      disablePadding
      className={`quicklist-item${item.state === 'IN_CART' ? ' quicklist-item--in-cart' : ''}${item.state === 'UNAVAILABLE' ? ' quicklist-item--unavailable' : ''}`}
      secondaryAction={
        <Tooltip title={`Remove ${item.name}`}>
          <span>
            <IconButton
              edge="end"
              aria-label={`Remove ${item.name}`}
              disabled={busy || disabled || !item.updatedAt}
              onClick={() => void run(() => onRemove(item.id))}
              size="small"
            >
              <HighlightOffIcon />
            </IconButton>
          </span>
        </Tooltip>
      }
    >
      <ListItemButton
        onClick={() => void run(() => onCycle(item))}
        disabled={busy || disabled || !item.updatedAt}
        aria-label={`${item.name}, ${item.state.toLowerCase().replace('_', ' ')}. Tap to change status`}
      >
        <ListItemIcon className="item-state-icon">
          {busy ? <CircularProgress size={24} color="secondary" /> : stateIcon[item.state]}
        </ListItemIcon>
        <ListItemText primary={item.name} secondary={stateLabel[item.state]} />
      </ListItemButton>
    </ListItem>
  );
}
