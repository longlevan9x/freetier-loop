import { AUTH_PREFIX, HEADER } from '@freetier-loop/shared';
import { createAuthClient } from 'better-auth/react';
import { webEnv } from '../config/env';

export const betterAuthClient = createAuthClient({
  baseURL: `${webEnv.VITE_API_BASE_URL || window.location.origin}${AUTH_PREFIX}`,
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
  const res = await fetch(`${webEnv.VITE_API_BASE_URL}${AUTH_PREFIX}/sign-in/email`, {
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
  const res = await fetch(`${webEnv.VITE_API_BASE_URL}${AUTH_PREFIX}/get-session`, {
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
  await fetch(`${webEnv.VITE_API_BASE_URL}${AUTH_PREFIX}/sign-out`, {
    method: 'POST',
    credentials: 'include',
  });
};
