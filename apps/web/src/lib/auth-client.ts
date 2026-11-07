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

export type SignInResponse =
  | { requiresTwoFactor: false; user: AuthSessionUser }
  | {
      requiresTwoFactor: true;
      reason: 'new_device' | 'new_ip' | 'always_required';
      ip: string;
      country: string;
    };

export const signInWithTurnstile = async (input: {
  email: string;
  password: string;
  captchaToken?: string;
  twoFactorCode?: string;
}): Promise<SignInResponse> => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (input.captchaToken) {
    headers[HEADER.CAPTCHA] = input.captchaToken;
  }

  const res = await fetch(`${resolveApiPrefixUrl()}/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      twoFactorCode: input.twoFactorCode,
    }),
  });
  const json = (await res.json()) as {
    data?: SignInResponse;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !json.data) {
    throw json;
  }
  return json.data;
};

export type ActiveSession = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  country: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

export const fetchActiveSessions = async (): Promise<ActiveSession[]> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/sessions`, {
    method: 'GET',
    credentials: 'include',
  });
  const json = (await res.json()) as {
    data?: ActiveSession[];
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !json.data) {
    throw json;
  }
  return json.data;
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/sessions/${sessionId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  const json = (await res.json()) as {
    data?: { revoked: boolean };
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw json;
  }
};

export const revokeOtherSessions = async (): Promise<void> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/sessions/revoke-others`, {
    method: 'POST',
    credentials: 'include',
  });
  const json = (await res.json()) as {
    data?: { revoked: boolean };
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw json;
  }
};

export type TwoFactorStatus = {
  enabled: boolean;
  always: boolean;
};

export type TwoFactorSetup = {
  secret: string;
  otpauthUri: string;
};

export const fetchTwoFactorStatus = async (): Promise<TwoFactorStatus> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/2fa/status`, {
    method: 'GET',
    credentials: 'include',
  });
  const json = (await res.json()) as {
    data?: TwoFactorStatus;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !json.data) {
    throw json;
  }
  return json.data;
};

export const setupTwoFactor = async (): Promise<TwoFactorSetup> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/2fa/setup`, {
    method: 'POST',
    credentials: 'include',
  });
  const json = (await res.json()) as {
    data?: TwoFactorSetup;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !json.data) {
    throw json;
  }
  return json.data;
};

export const enableTwoFactor = async (code: string, always?: boolean): Promise<void> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/2fa/enable`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, always }),
  });
  const json = (await res.json()) as {
    data?: { enabled: boolean };
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw json;
  }
};

export const disableTwoFactor = async (password: string): Promise<void> => {
  const res = await fetch(`${resolveApiPrefixUrl()}/2fa/disable`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const json = (await res.json()) as {
    data?: { disabled: boolean };
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw json;
  }
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
