import { BENTO_SIZE } from '@freetier-loop/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { BentoCard } from '../../../components/bento/BentoCard';
import { BentoGrid } from '../../../components/bento/BentoGrid';
import { Button } from '../../../components/ui/button';
import {
  disableTwoFactor,
  enableTwoFactor,
  fetchActiveSessions,
  fetchTwoFactorStatus,
  revokeOtherSessions,
  revokeSession,
  setupTwoFactor,
} from '../../../lib/auth-client';
import { formatApiError } from '../../../lib/error-messages';
import { queryKeys } from '../../../lib/query-keys';
import { apiClient } from '../../../lib/rpc';

const parseUserAgent = (ua: string | null): string => {
  if (!ua || ua === 'unknown') return 'Không rõ thiết bị';
  let browser = 'Browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} trên ${os}`;
};

export const SettingsView = () => {
  const queryClient = useQueryClient();

  // Settings config query
  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: async () => {
      const res = await apiClient.api.v1.settings.$get();
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    },
  });

  // 2FA state & queries
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [alwaysRequired, setAlwaysRequired] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  useEffect(() => {
    if (setupData?.otpauthUri) {
      QRCode.toDataURL(setupData.otpauthUri, {
        margin: 1,
        width: 140,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then(setQrCodeDataUrl)
        .catch(() => setQrCodeDataUrl(null));
    } else {
      setQrCodeDataUrl(null);
    }
  }, [setupData?.otpauthUri]);

  const twoFactorQuery = useQuery({
    queryKey: queryKeys.auth.twoFactorStatus,
    queryFn: fetchTwoFactorStatus,
  });

  const setup2faMutation = useMutation({
    mutationFn: setupTwoFactor,
    onSuccess: (data) => {
      setSetupData(data);
      setTwoFactorError(null);
      setVerifyCode('');
    },
    onError: (err) => {
      setTwoFactorError(formatApiError(err, 'Không thể khởi tạo mã 2FA'));
    },
  });

  const enable2faMutation = useMutation({
    mutationFn: async () => {
      if (!verifyCode || verifyCode.trim().length !== 6) {
        throw { error: { message: 'Vui lòng nhập đủ 6 chữ số' } };
      }
      return enableTwoFactor(verifyCode.trim(), alwaysRequired);
    },
    onSuccess: () => {
      setSetupData(null);
      setVerifyCode('');
      setTwoFactorError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.twoFactorStatus });
    },
    onError: (err) => {
      setTwoFactorError(formatApiError(err, 'Xác nhận mã 2FA thất bại'));
    },
  });

  const disable2faMutation = useMutation({
    mutationFn: async () => {
      if (!disablePassword) {
        throw { error: { message: 'Vui lòng nhập mật khẩu xác nhận' } };
      }
      return disableTwoFactor(disablePassword);
    },
    onSuccess: () => {
      setShowDisableForm(false);
      setDisablePassword('');
      setTwoFactorError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.twoFactorStatus });
    },
    onError: (err) => {
      setTwoFactorError(formatApiError(err, 'Tắt 2FA thất bại'));
    },
  });

  // Active Sessions state & queries
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionsQuery = useQuery({
    queryKey: queryKeys.auth.sessions,
    queryFn: fetchActiveSessions,
  });

  const revokeSessionMutation = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      setSessionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions });
    },
    onError: (err) => {
      setSessionError(formatApiError(err, 'Không thể đăng xuất phiên'));
    },
  });

  const revokeOtherSessionsMutation = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => {
      setSessionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions });
    },
    onError: (err) => {
      setSessionError(formatApiError(err, 'Không thể đăng xuất các thiết bị khác'));
    },
  });

  const handleCopySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const data = settingsQuery.data;
  const twoFactor = twoFactorQuery.data;
  const sessions = sessionsQuery.data ?? [];
  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security & Quota Settings</h1>
        <p className="text-sm text-zinc-400">
          Cấu hình bảo mật 2 lớp (2FA), quản lý phiên đăng nhập thiết bị và hạn ngạch tài nguyên
          Cloud.
        </p>
      </div>

      <BentoGrid>
        {/* 2FA Card */}
        <BentoCard
          title="Xác thực 2 lớp (Adaptive 2FA - TOTP)"
          subtitle="Google Authenticator / Authy / Microsoft Authenticator"
          size={BENTO_SIZE.MD}
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={twoFactorQuery.isPending}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Trạng thái bảo vệ:</span>
              {twoFactor?.enabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Đang bật (Active)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                  Chưa kích hoạt
                </span>
              )}
            </div>

            {twoFactorError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-900/70 bg-red-950/50 p-2.5 text-xs text-red-300"
              >
                {twoFactorError}
              </div>
            ) : null}

            {twoFactor?.enabled ? (
              <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 text-xs">
                <div className="space-y-1">
                  <span className="text-zinc-400">Chế độ xác thực:</span>
                  <p className="font-medium text-zinc-200">
                    {twoFactor.always
                      ? 'Luôn yêu cầu mã 2FA mỗi lần đăng nhập'
                      : 'Xác thực thích ứng (Adaptive) - Chỉ hỏi khi phát hiện IP hoặc thiết bị mới'}
                  </p>
                </div>

                {!showDisableForm ? (
                  <div className="pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowDisableForm(true);
                        setTwoFactorError(null);
                      }}
                      className="h-8 text-xs text-red-400 border-red-900/50 hover:bg-red-950/40"
                    >
                      Tắt xác thực 2 lớp (2FA)
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-zinc-800">
                    <label
                      htmlFor="disable-password-input"
                      className="block text-[11px] text-zinc-400"
                    >
                      Nhập mật khẩu hiện tại để xác nhận tắt 2FA:
                    </label>
                    <input
                      id="disable-password-input"
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="Mật khẩu của bạn"
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-red-500"
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        disabled={!disablePassword || disable2faMutation.isPending}
                        onClick={() => disable2faMutation.mutate()}
                        className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                      >
                        {disable2faMutation.isPending ? 'Đang tắt…' : 'Xác nhận tắt'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setShowDisableForm(false);
                          setDisablePassword('');
                        }}
                        className="h-7 text-xs text-zinc-400"
                      >
                        Hủy
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : setupData ? (
              <div className="space-y-3.5 rounded-xl border border-emerald-500/20 bg-zinc-950/70 p-3.5 text-xs">
                <div className="flex flex-col sm:flex-row items-center gap-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  {qrCodeDataUrl ? (
                    <div className="rounded-lg bg-white p-1.5 shadow-sm shrink-0">
                      <img
                        src={qrCodeDataUrl}
                        alt="Scan QR code with Authenticator app"
                        className="h-28 w-28 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500 text-[11px] shrink-0">
                      Đang tạo QR...
                    </div>
                  )}
                  <div className="space-y-2 flex-1 text-xs">
                    <span className="font-semibold text-zinc-200 block">
                      1. Quét mã QR bằng App Authenticator:
                    </span>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      Mở Google Authenticator, Authy, hoặc ứng dụng bảo mật trên điện thoại để quét
                      mã bên cạnh.
                    </p>
                    <div className="pt-1">
                      <span className="text-[11px] text-zinc-400 block mb-1">
                        Hoặc nhập thủ công khóa bí mật (Secret Key):
                      </span>
                      <div className="flex items-center gap-1.5">
                        <code className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-emerald-400 break-all select-all">
                          {setupData.secret}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleCopySecret(setupData.secret)}
                          className="h-7 px-2 text-xs shrink-0"
                        >
                          {copiedSecret ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <span className="font-semibold text-zinc-200">2. Tùy chọn bảo mật:</span>
                  <label className="flex items-start gap-2 text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alwaysRequired}
                      onChange={(e) => setAlwaysRequired(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>
                      Luôn yêu cầu 2FA mỗi lần đăng nhập{' '}
                      <span className="text-zinc-500 text-[11px]">
                        (Bỏ chọn để dùng chế độ Adaptive: chỉ hỏi khi có IP / thiết bị mới)
                      </span>
                    </span>
                  </label>
                </div>

                <div className="space-y-1.5 pt-1">
                  <label htmlFor="verify-code-input" className="block font-semibold text-zinc-200">
                    3. Nhập mã 6 chữ số từ App để kích hoạt:
                  </label>
                  <input
                    id="verify-code-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-center font-mono text-lg font-bold tracking-widest text-emerald-400 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    disabled={verifyCode.length !== 6 || enable2faMutation.isPending}
                    onClick={() => enable2faMutation.mutate()}
                    className="h-8 text-xs font-semibold text-zinc-950"
                  >
                    {enable2faMutation.isPending ? 'Đang kích hoạt…' : 'Xác nhận kích hoạt'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSetupData(null);
                      setVerifyCode('');
                    }}
                    className="h-8 text-xs text-zinc-400"
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Bảo vệ tài khoản quản trị khi lộ mật khẩu. Khi bật, hệ thống sẽ tự động đối chiếu
                  IP và thiết bị của phiên đăng nhập trước đó và yêu cầu mã OTP khi phát hiện vị trí
                  lạ.
                </p>
                <Button
                  type="button"
                  disabled={setup2faMutation.isPending}
                  onClick={() => setup2faMutation.mutate()}
                  className="h-8 text-xs font-medium text-zinc-950"
                >
                  <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                  {setup2faMutation.isPending ? 'Đang tạo khóa…' : 'Bắt đầu thiết lập 2FA'}
                </Button>
              </div>
            )}
          </div>
        </BentoCard>

        {/* Access Guard Card */}
        <BentoCard
          title="Access & Self-Protection Guard"
          subtitle="Configured via Worker environment secrets"
          size={BENTO_SIZE.MD}
          icon={<Lock className="h-4 w-4" />}
          loading={settingsQuery.isPending}
        >
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-zinc-400">Allowlisted Admin Emails: </span>
              <span className="font-mono text-zinc-200">
                {data?.adminEmails.length ? data.adminEmails.join(', ') : 'All seeded admins'}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">Self-Protected Hosts: </span>
              <span className="font-mono text-emerald-400">
                {data?.selfProtectedHosts.length
                  ? data.selfProtectedHosts.join(', ')
                  : 'Auto-detected from BETTER_AUTH_URL'}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">AES-256-GCM Key Version: </span>
              <span className="font-mono text-zinc-200">v{data?.encryptionKeyVersion ?? 1}</span>
            </div>
          </div>
        </BentoCard>

        {/* Free-Tier Quota Thresholds */}
        <BentoCard
          title="Free-Tier Quota Thresholds"
          subtitle="Used by Usage Service & Cron sync"
          size={BENTO_SIZE.MD}
          icon={<Settings className="h-4 w-4" />}
        >
          <div className="space-y-1.5 font-mono text-xs text-zinc-300">
            <div>
              CF Workers Requests/day:{' '}
              {data?.freeTierLimits.CF_WORKERS_REQUESTS_PER_DAY.toLocaleString() ?? '100,000'}
            </div>
            <div>
              Vercel Deployments/day: {data?.freeTierLimits.VERCEL_DEPLOYMENTS_PER_DAY ?? 100}
            </div>
            <div>
              Supabase Active Free Projects/user:{' '}
              {data?.freeTierLimits.SUPABASE_ACTIVE_PROJECTS_MAX ?? 2}
            </div>
          </div>
        </BentoCard>

        {/* Active Sessions Card */}
        <BentoCard
          title={`Thiết bị & Phiên đăng nhập (${sessions.length})`}
          subtitle="Các thiết bị và vị trí IP đang duy trì đăng nhập vào bảng điều khiển"
          size={BENTO_SIZE.FULL}
          icon={<Laptop className="h-4 w-4" />}
          loading={sessionsQuery.isPending}
          action={
            otherSessionsCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={revokeOtherSessionsMutation.isPending}
                onClick={() => {
                  if (confirm('Bạn có chắc muốn đăng xuất tất cả các thiết bị khác không?')) {
                    revokeOtherSessionsMutation.mutate();
                  }
                }}
                className="h-8 text-xs text-amber-400 border-amber-900/50 hover:bg-amber-950/40"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" />
                {revokeOtherSessionsMutation.isPending
                  ? 'Đang đăng xuất…'
                  : `Đăng xuất ${otherSessionsCount} thiết bị khác`}
              </Button>
            ) : null
          }
        >
          <div className="space-y-3">
            {sessionError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-900/70 bg-red-950/50 p-2.5 text-xs text-red-300"
              >
                {sessionError}
              </div>
            ) : null}

            {sessions.length === 0 ? (
              <p className="text-xs text-zinc-400">Không có dữ liệu phiên đăng nhập.</p>
            ) : (
              <div className="divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
                {sessions.map((ses) => (
                  <div
                    key={ses.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 transition hover:bg-zinc-900/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                        {ses.userAgent?.includes('Mobi') || ses.userAgent?.includes('Android') ? (
                          <Smartphone className="h-4 w-4" />
                        ) : (
                          <Laptop className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-200">
                            {parseUserAgent(ses.userAgent)}
                          </span>
                          {ses.isCurrent ? (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/30">
                              Phiên hiện tại
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-zinc-400">
                          <span className="inline-flex items-center gap-1 font-mono text-zinc-300">
                            <Globe className="h-3 w-3 text-zinc-500" />
                            {ses.ipAddress ?? '127.0.0.1'}
                          </span>
                          <span>·</span>
                          <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-300 font-mono">
                            {ses.country ?? 'LOCAL'}
                          </span>
                          <span>·</span>
                          <span title={new Date(ses.createdAt).toLocaleString()}>
                            Đăng nhập: {new Date(ses.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!ses.isCurrent ? (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={revokeSessionMutation.isPending}
                        onClick={() => {
                          if (confirm('Đăng xuất thiết bị này?')) {
                            revokeSessionMutation.mutate(ses.id);
                          }
                        }}
                        className="h-8 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Đăng xuất
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  );
};
