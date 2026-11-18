import { useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../../services/firebase/client';

interface AuthState {
  user: User | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    if (!auth) {
      setState({ user: null, loading: false });
      return;
    }
    return onAuthStateChanged(
      auth,
      (user) => setState({ user, loading: false }),
      () => setState({ user: null, loading: false }),
    );
  }, []);

  return state;
}
