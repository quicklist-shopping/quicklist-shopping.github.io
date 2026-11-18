import { useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Alert, CircularProgress, CssBaseline, IconButton, ThemeProvider, Tooltip, createTheme } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import type { User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './services/firebase/client';
import { isAllowedUser, signOutUser } from './services/firebase/auth';
import { useAuth } from './features/auth/useAuth';
import { SignInPage } from './features/auth/SignInPage';
import { AccessDeniedPage } from './features/auth/AccessDeniedPage';
import { NewListButton } from './features/lists/NewListButton';
import { ListPage } from './features/lists/ListPage';
import { useOnlineStatus } from './app/useOnlineStatus';
import { indigo } from '@mui/material/colors';
import './App.css';

const theme = createTheme({
  palette: { background: { default: indigo[100] } },
});

function ListRoute({ user, online }: { user: User; online: boolean }) {
  const { id } = useParams<{ id: string }>();
  if (!id || id === 'new') return <Navigate to="/" replace />;
  return <ListPage listId={id} user={user} online={online} />;
}

function SignedInApp({ user }: { user: User }) {
  const online = useOnlineStatus();
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOutUser();
    } catch {
      setSignOutError('Unable to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <main className="app-shell">
      {!online && <Alert severity="warning" sx={{ width: '100%', maxWidth: 360, mb: 1 }}>You're offline. Reconnect before making changes.</Alert>}
      <header className="app-header">
        <NewListButton user={user} online={online} />
        <Tooltip title={`Signed in as ${user.email || 'Google account'} — sign out`}>
          <IconButton className="account-button" aria-label="Sign out" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? <CircularProgress size={22} /> : <LogoutIcon />}
          </IconButton>
        </Tooltip>
      </header>
      {signOutError && <Alert severity="error" sx={{ width: '100%', maxWidth: 360, mb: 1 }}>{signOutError}</Alert>}
      <Routes>
        <Route path="/" element={null} />
        <Route path="/new" element={<Navigate to="/" replace />} />
        <Route path="/:id" element={<ListRoute user={user} online={online} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

function Application() {
  const { user, loading } = useAuth();

  if (!isFirebaseConfigured || !auth) {
    return (
      <main className="app-shell">
        <Alert severity="warning" className="setup-message">
          Firebase is not configured. For local development, start the Firebase emulators with <code>npm run dev:emulator</code>.
        </Alert>
      </main>
    );
  }

  if (loading) {
    return <main className="app-shell"><CircularProgress color="secondary" aria-label="Checking sign-in" /></main>;
  }
  if (!user) return <main className="app-shell"><SignInPage /></main>;
  if (!isAllowedUser(user)) return <main className="app-shell"><AccessDeniedPage email={user.email} /></main>;

  return <SignedInApp user={user} />;
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <Application />
      </HashRouter>
    </ThemeProvider>
  );
}
