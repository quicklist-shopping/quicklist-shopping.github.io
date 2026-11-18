import { useState } from 'react';
import { Alert, Button, Paper, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { signInWithGoogle } from '../../services/firebase/auth';

export function SignInPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (reason) {
      const code = (reason as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('Unable to sign in with Google. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper className="auth-card" elevation={2}>
      <Typography variant="h5" component="h1" gutterBottom>Quicklist</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Sign in with an approved Google account to use your lists.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Button
        variant="contained"
        color="secondary"
        startIcon={<GoogleIcon />}
        onClick={signIn}
        disabled={busy}
        fullWidth
      >
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </Button>
    </Paper>
  );
}
