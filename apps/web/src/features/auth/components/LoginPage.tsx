import { AUTH, WEB_ROUTES } from '@freetier-loop/shared';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRightLeft,
  Globe,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [twoFactorChallenge, setTwoFactorChallenge] = useState<{
    reason: 'new_device' | 'new_ip' | 'always_required';
    ip: string;
    country: string;
  } | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const signInMutation = useMutation({
    mutationFn: async () => {
      const parsed = loginFormSchema.safeParse({ email, password });
      if (!parsed.success) {
        throw { error: { message: parsed.error.issues[0]?.message ?? 'Invalid input' } };
      }

      if (twoFactorChallenge) {
        if (!twoFactorCode || twoFactorCode.trim().length !== 6) {
          throw { error: { message: 'Vui lòng nhập đủ 6 chữ số mã xác thực 2FA' } };
        }
        return signInWithTurnstile({
          email: parsed.data.email,
          password: parsed.data.password,
          twoFactorCode: twoFactorCode.trim(),
        });
      }

      return signInWithTurnstile({
        email: parsed.data.email,
        password: parsed.data.password,
        captchaToken,
      });
    },
    onSuccess: async (data) => {
      if (data.requiresTwoFactor) {
        setTwoFactorChallenge({
          reason: data.reason,
          ip: data.ip,
          country: data.country,
        });
        setFieldError(null);
        return;
      }
      queryClient.setQueryData(queryKeys.session.current, data.user);
      await navigate({ to: WEB_ROUTES.DASHBOARD });
    },
    onError: (err) => {
      setFieldError(formatApiError(err, 'Sign-in failed'));
      if (!twoFactorChallenge) {
        turnstileRef.current?.reset();
        setCaptchaToken('');
      }
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    signInMutation.mutate();
  };

  const handleBackToCredentials = () => {
    setTwoFactorChallenge(null);
    setTwoFactorCode('');
    setFieldError(null);
    turnstileRef.current?.reset();
    setCaptchaToken('');
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-7 shadow-xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            {twoFactorChallenge ? (
              <ShieldAlert className="h-5 w-5 text-amber-400" />
            ) : (
              <ArrowRightLeft className="h-5 w-5" />
            )}
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-100">
              {twoFactorChallenge ? 'Xác thực 2 lớp (2FA)' : 'freetier-loop Admin Login'}
            </h1>
            <p className="text-xs text-zinc-400">
              {twoFactorChallenge
                ? 'Nhập mã 6 chữ số từ ứng dụng Authenticator'
                : 'Single-admin console · Protected by Cloudflare Turnstile'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {twoFactorChallenge ? (
            <>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-medium text-amber-300">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  {twoFactorChallenge.reason === 'always_required' ? (
                    <span>Tài khoản yêu cầu mã 2FA mỗi lần đăng nhập</span>
                  ) : (
                    <span>Cảnh báo an toàn: Phát hiện phiên đăng nhập mới</span>
                  )}
                </div>
                <p className="text-amber-200/90 leading-relaxed">
                  {twoFactorChallenge.reason === 'always_required'
                    ? 'Bạn đã bật chế độ yêu cầu 2FA cho tất cả các lần đăng nhập.'
                    : 'Hệ thống nhận diện đăng nhập từ địa chỉ IP hoặc trình duyệt mới. Để bảo vệ tài nguyên cloud, vui lòng nhập mã xác thực từ app Authenticator.'}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-amber-300/80">
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    IP: <strong className="font-mono text-zinc-200">{twoFactorChallenge.ip}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Quốc gia:{' '}
                    <strong className="text-zinc-200">{twoFactorChallenge.country}</strong>
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-2fa"
                  className="flex items-center justify-between text-xs font-medium text-zinc-300"
                >
                  <span className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
                    Mã xác thực 6 chữ số (TOTP)
                  </span>
                  <span className="text-[11px] text-zinc-500">Google / Authy / Microsoft</span>
                </label>
                <input
                  id="login-2fa"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  // biome-ignore lint/a11y/noAutofocus: 2FA UX focus
                  autoFocus
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-emerald-400 outline-none transition focus:border-emerald-500"
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

              <div className="space-y-2 pt-1">
                <Button
                  type="submit"
                  disabled={twoFactorCode.length !== 6 || signInMutation.isPending}
                  className="w-full h-11 text-sm font-semibold text-zinc-950"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {signInMutation.isPending ? 'Đang xác thực…' : 'Xác thực & Đăng nhập'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBackToCredentials}
                  className="w-full text-xs text-zinc-400 hover:text-zinc-200"
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  Quay lại đăng nhập với tài khoản khác
                </Button>
              </div>
            </>
          ) : (
            <>
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

              <div className="flex justify-center py-1">
                {webEnv.VITE_TURNSTILE_SITE_KEY ? (
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={webEnv.VITE_TURNSTILE_SITE_KEY}
                    onSuccess={(token) => setCaptchaToken(token)}
                    onExpire={() => setCaptchaToken('')}
                  />
                ) : (
                  <p className="text-xs text-amber-400">Missing VITE_TURNSTILE_SITE_KEY in .env</p>
                )}
              </div>

              {fieldError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-900/70 bg-red-950/50 p-3 text-xs text-red-300"
                >
                  {fieldError}
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={!captchaToken || signInMutation.isPending}
                className="w-full h-11 text-sm font-semibold text-zinc-950"
              >
                <Lock className="h-4 w-4" />
                {signInMutation.isPending ? 'Verifying & Signing In…' : 'Sign In to Console'}
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
