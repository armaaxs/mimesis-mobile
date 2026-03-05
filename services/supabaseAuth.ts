import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Provider, type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const FALLBACK_SUPABASE_URL = 'https://placeholder.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY = 'placeholder-anon-key';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || FALLBACK_SUPABASE_URL,
  supabaseAnonKey || FALLBACK_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

type SupportedOAuthProvider = Extract<Provider, 'google' | 'apple'>;

const parseHashParams = (url: string) => {
  const [, hash = ''] = url.split('#');
  const params = new URLSearchParams(hash);

  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
  };
};

const ensureSupabaseConfigured = () => {
  if (isSupabaseConfigured) {
    return;
  }

  throw new Error(
    'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
};

export const getOAuthRedirectUrl = () => Linking.createURL('oauth-callback');

export const signInWithOAuthProvider = async (provider: SupportedOAuthProvider) => {
  ensureSupabaseConfigured();

  const redirectTo = getOAuthRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return { error };
  }

  if (!data?.url) {
    return { error: new Error('No OAuth URL was returned by Supabase.') };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    return { error: new Error('Authentication was cancelled.') };
  }

  const callbackUrl = new URL(result.url);
  const code = callbackUrl.searchParams.get('code');

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return { error: exchangeError };
    }

    return { error: null };
  }

  const { accessToken, refreshToken } = parseHashParams(result.url);

  if (accessToken && refreshToken) {
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (setSessionError) {
      return { error: setSessionError };
    }

    return { error: null };
  }

  return { error: new Error('OAuth callback did not include a valid auth session.') };
};

export const getCurrentSession = async (): Promise<Session | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
};
