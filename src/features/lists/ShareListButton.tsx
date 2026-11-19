import { useState } from 'react';
import { Alert, Button } from '@mui/material';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';

export function ShareListButton() {
  const [error, setError] = useState('');

  // The native sheet is only available in secure contexts on supported browsers.
  // CSS additionally limits this control to touch devices.
  if (typeof navigator.share !== 'function') return null;

  const share = () => {
    setError('');
    // Call share() directly from the click handler: browsers require a user gesture.
    // The hash is part of the URL and is required for a shareable list on GitHub Pages.
    void navigator.share({ title: 'Quicklist', url: window.location.href }).catch((reason: unknown) => {
      if (reason && typeof reason === 'object' && 'name' in reason && reason.name === 'AbortError') return;
      setError('Could not open the share menu. Copy the link from your browser instead.');
    });
  };

  return (
    <div className="share-list-control">
      <Button
        size="small"
        variant="text"
        startIcon={<IosShareRoundedIcon />}
        onClick={share}
        aria-label="Share this list"
      >
        Share list
      </Button>
      {error && <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setError('')}>{error}</Alert>}
    </div>
  );
}
