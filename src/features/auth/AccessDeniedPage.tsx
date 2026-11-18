import { useState } from 'react';
import { Alert, Button, Paper, Typography } from '@mui/material';
import { signOutUser } from '../../services/firebase/auth';

export function AccessDeniedPage({ email }: { email: string | null }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchAccount = async () => {
    setBusy(true);
    setError('');
    try {
      await signOutUser();
    } catch {
      setError('Unable to sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper className="auth-card" elevation={2}>
      <Typography variant="h5" component="h1" gutterBottom>Access denied</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {email ? `${email} is not on the approved account list.` : 'This Google account is not approved.'}
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Button variant="contained" color="secondary" onClick={switchAccount} disabled={busy}>
        {busy ? 'Signing out…' : 'Use another account'}
      </Button>
    </Paper>
  );
}
