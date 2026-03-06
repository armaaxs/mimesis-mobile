import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';

import { getCurrentSession, signInWithOAuthProvider, supabase } from '@/services/supabaseAuth';
import { clearUserSessionCache } from '@/services/sessionCache';
import { flushSyncQueue, hydrateLocalLibraryFromUserBooks, reconcileFromSupabase } from '@/services/syncService';
import { listBookCatalog } from '@/utils/bookRepository';

export const useSupabaseAuth = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const runForegroundSync = async () => {
      if (!mounted) {
        return;
      }

      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();

      if (!activeSession?.user?.id) {
        return;
      }

      await flushSyncQueue();
      await hydrateLocalLibraryFromUserBooks();

      const localBooks = await listBookCatalog();
      if (localBooks.length > 0) {
        await reconcileFromSupabase(localBooks.map((item) => item.id));
      }
    };

    const bootstrap = async () => {
      const currentSession = await getCurrentSession();
      if (!mounted) {
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setLoading(false);

      if (currentSession?.user) {
        void runForegroundSync();
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      if (nextSession?.user) {
        void runForegroundSync();
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void runForegroundSync();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => signInWithOAuthProvider('google'), []);
  const signInWithApple = useCallback(async () => signInWithOAuthProvider('apple'), []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();

    if (!error) {
      await clearUserSessionCache();
    }

    return { error };
  }, []);

  return useMemo(
    () => ({
      session,
      user,
      loading,
      isAuthenticated: Boolean(session),
      signInWithGoogle,
      signInWithApple,
      signOut,
    }),
    [loading, session, signInWithApple, signInWithGoogle, signOut, user]
  );
};
