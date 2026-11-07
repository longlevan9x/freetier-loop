import { AUTH, TURNSTILE_TEST_KEYS, WEB_ROUTES } from '@freetier-loop/shared';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRightLeft, Lock, ShieldCheck } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { z } from 'zod';
import { webEnv } from '../../../config/env';
import { signInWithTurnstile } from '../../../lib/auth-client';
import { formatApiError } from '../../../lib/error-messages';
import { queryKeys } from '../../../lib/query-keys';

const loginFormSchema = z.object({
  email: z.string().trim().email('Please enter a valid admin email address'),
  password: z
    .string()
    .min(
      AUTH.MIN_PASSWORD_LENGTH,
      `Password must be at least ${AUTH.MIN_PASSWORD_LENGTH} characters`,
    ),
});

export const LoginPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const isTestKey = webEnv.VITE_TURNSTILE_SITE_KEY === TURNSTILE_TEST_KEYS.ALWAYS_PASS_SITE_KEY;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string>(isTestKey ? 'dev-turnstile-pass' : '');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const signInMutation = useMutation({
    mutationFn: async () => {
      const parsed = loginFormSchema.safeParse({ email, password });
      if (!parsed.success) {
        throw { error: { message: parsed.error.issues[0]?.message ?? 'Invalid input' } };
      }
      return signInWithTurnstile({
        email: parsed.data.email,
        password: parsed.data.password,
        captchaToken,
      });
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKeys.session.current, data.user);
      await navigate({ to: WEB_ROUTES.DASHBOARD });
    },
    onError: (err) => {
      setFieldError(formatApiError(err, 'Sign-in failed'));
      turnstileRef.current?.reset();
      if (!isTestKey) {
        setCaptchaToken('');
      }
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    signInMutation.mutate();
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-7 shadow-xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <ArrowRightLeft className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-100">
              freetier-loop Admin Login
            </h1>
            <p className="text-xs text-zinc-400">
              Single-admin console · Protected by Cloudflare Turnstile
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-zinc-300">
              Admin Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-zinc-300">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500"
            />
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Cloudflare Turnstile Verification
              </span>
              {captchaToken ? (
                <span className="text-emerald-400">Verified</span>
              ) : (
                <span>Required</span>
              )}
            </div>
            <Turnstile
              ref={turnstileRef}
              siteKey={webEnv.VITE_TURNSTILE_SITE_KEY}
              onSuccess={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(isTestKey ? 'dev-turnstile-pass' : '')}
            />
          </div>

          {fieldError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-900/70 bg-red-950/50 p-3 text-xs text-red-300"
            >
              {fieldError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!captchaToken || signInMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {signInMutation.isPending ? 'Verifying & Signing In…' : 'Sign In to Console'}
          </button>
        </form>
      </div>
    </div>
  );
};
