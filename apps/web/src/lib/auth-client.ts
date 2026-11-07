import { AUTH_PREFIX, HEADER } from '@freetier-loop/shared';
import { createAuthClient } from 'better-auth/react';
import { webEnv } from '../config/env';

const resolveApiOrigin = (): string => {
  const configured = webEnv.VITE_API_BASE_URL.trim().replace(/\/+$/, '');
  if (configured.startsWith('http://') || configured.startsWith('https://')) {
    return configured;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:8787';
};

const resolveApiPrefixUrl = (): string => {
  const configured = webEnv.VITE_API_BASE_URL.trim().replace(/\/+$/, '');
  return `${configured}${AUTH_PREFIX}`;
};

export const betterAuthClient = createAuthClient({
  baseURL: `${resolveApiOrigin()}${AUTH_PREFIX}`,
});

export type AuthSessionUser = {
  id: string;
  email: string;
  name: string;
};

export const signInWithTurnstile = async (input: {
  email: string;
  password: string;
  captchaToken: string;
}): Promise<{ user: AuthSessionUser }> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      [HEADER.CAPTCHA]: input.captchaToken,
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
    }),
  });
  const json = (await res.json()) as {
    data?: { user: AuthSessionUser };
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !json.data) {
    throw json;
  }
  return json.data;
};

export const fetchCurrentSession = async (): Promise<AuthSessionUser | null> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/get-session`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { user: AuthSessionUser | null };
  };
  return json.data?.user ?? null;
};

export const signOutSession = async (): Promise<void> => {
  await fetch(`${resolveApiPrefixUrl()}/sign-out`, {
    method: 'POST',
    credentials: 'include',
  });
};
