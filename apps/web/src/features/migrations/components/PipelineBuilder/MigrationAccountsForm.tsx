import { AlertCircle, Cloud, Database, GitBranch } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import type { PipelineStepItem } from '../../model/types';

export interface AccountOption {
  id: string;
  label: string;
  provider: string;
  accountType?: string | null | undefined;
  externalAccountId?: string | null | undefined;
}

export interface ResourceOption {
  id: string;
  providerAccountId: string;
  name: string;
  kind: string;
}

export interface GitLabProjectOption {
  id: string;
  externalId: string;
  name: string;
}

export interface MigrationAccountsFormProps {
  accounts: AccountOption[];
  resources: ResourceOption[];
  sourceAccountId: string;
  setSourceAccountId: (id: string) => void;
  resourceId: string;
  setResourceId: (id: string) => void;
  targetAccountId: string;
  setTargetAccountId: (id: string) => void;
  gitlabAccountId: string;
  setGitlabAccountId: (id: string) => void;
  gitlabProjectId?: string | undefined;
  setGitlabProjectId?: ((id: string) => void) | undefined;
  gitlabProjects?: GitLabProjectOption[] | undefined;
  steps: PipelineStepItem[];
}

export const MigrationAccountsForm = ({
  accounts,
  resources,
  sourceAccountId,
  setSourceAccountId,
  resourceId,
  setResourceId,
  targetAccountId,
  setTargetAccountId,
  gitlabAccountId,
  setGitlabAccountId,
  gitlabProjectId,
  setGitlabProjectId,
  gitlabProjects = [],
  steps,
}: MigrationAccountsFormProps) => {
  // Determine participating providers based on steps in the pipeline
  const hasVercel = steps.some((s) => s.actionId.startsWith('vercel.'));
  const hasCloudflare = steps.some(
    (s) => s.actionId.startsWith('cf.') || s.actionId.startsWith('dns.'),
  );
  const hasSupabase = steps.some(
    (s) => s.actionId.startsWith('supabase.') || s.actionId.startsWith('env.'),
  );
  const hasGitLab = steps.some((s) => s.actionId.startsWith('gitlab.'));

  // Filter accounts strictly by provider
  const vercelAccounts = accounts.filter((a) => a.provider === 'vercel');
  const cfAccounts = accounts.filter((a) => a.provider === 'cloudflare');
  const supabaseAccounts = accounts.filter((a) => a.provider === 'supabase');
  const gitlabAccounts = accounts.filter((a) => a.provider === 'gitlab');

  // Currently selected GitLab account details
  const selectedGitLabAccount = gitlabAccounts.find((a) => a.id === gitlabAccountId);
  const isUserToken = selectedGitLabAccount?.accountType === 'user';
  const isProjectToken =
    !selectedGitLabAccount?.accountType || selectedGitLabAccount?.accountType === 'project';

  // Filter resources by kind and currently selected source account
  const vercelProjects = resources.filter(
    (r) =>
      r.kind === 'vercel_project' && (!sourceAccountId || r.providerAccountId === sourceAccountId),
  );
  const cfZones = resources.filter(
    (r) => r.kind === 'zone' && (!sourceAccountId || r.providerAccountId === sourceAccountId),
  );
  const supabaseProjects = resources.filter(
    (r) =>
      r.kind === 'supabase_project' &&
      (!sourceAccountId || r.providerAccountId === sourceAccountId),
  );

  // If no specific main provider detected in steps, default to Vercel unless other steps exist
  const showVercel = hasVercel || (!hasCloudflare && !hasSupabase);
  const showCloudflare = hasCloudflare;
  const showSupabase = hasSupabase;

  return (
    <div className="border-t border-zinc-800/80 pt-5 space-y-4">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          Tài khoản & Tài nguyên
        </h4>
        <p className="mt-0.5 text-xs text-zinc-400">
          Tài khoản và tài nguyên tương ứng theo từng dịch vụ tham gia trong quy trình.
        </p>
      </div>

      {/* VERCEL */}
      {showVercel ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition-all hover:border-zinc-700">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/70">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-zinc-800 text-zinc-100 font-bold text-xs">
                ▲
              </div>
              <div>
                <h5 className="text-xs font-bold text-zinc-100 uppercase tracking-wide">
                  Vercel (Projects & Domains)
                </h5>
                <span className="text-[11px] text-zinc-400">
                  Tài khoản và dự án trên nền tảng Vercel
                </span>
              </div>
            </div>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
              {vercelAccounts.length} tài khoản
            </span>
          </div>

          {vercelAccounts.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-2.5 text-xs text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Chưa có tài khoản Vercel nào được kết nối. Hãy vào mục <strong>Tài khoản</strong> để
                thêm Vercel API Token.
              </span>
            </div>
          ) : (
            <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Vercel Source */}
              <div>
                <label
                  htmlFor="vercel-source-account"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Tài khoản Vercel Nguồn:
                </label>
                <div className="mt-1">
                  <Select
                    value={sourceAccountId}
                    onValueChange={(val) => {
                      setSourceAccountId(val);
                      setResourceId('');
                    }}
                  >
                    <SelectTrigger id="vercel-source-account">
                      <SelectValue placeholder="Chọn Vercel nguồn..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vercelAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vercel Project */}
              <div>
                <label
                  htmlFor="vercel-resource-project"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Dự án Vercel cần chuyển (Project):
                </label>
                <div className="mt-1">
                  <Select value={resourceId} onValueChange={setResourceId}>
                    <SelectTrigger id="vercel-resource-project">
                      <SelectValue
                        placeholder={
                          sourceAccountId ? 'Chọn dự án Vercel...' : 'Chọn tài khoản nguồn trước'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {vercelProjects.length === 0 ? (
                        <div className="p-2 text-center text-xs text-zinc-500">
                          {sourceAccountId
                            ? 'Chưa có dự án nào (hãy bấm Đồng bộ ở trang Tài khoản)'
                            : 'Chọn tài khoản nguồn trước'}
                        </div>
                      ) : (
                        vercelProjects.map((res) => (
                          <SelectItem key={res.id} value={res.id}>
                            {res.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vercel Target */}
              <div>
                <label
                  htmlFor="vercel-target-account"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Tài khoản Vercel Đích:
                </label>
                <div className="mt-1">
                  <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                    <SelectTrigger id="vercel-target-account">
                      <SelectValue placeholder="Chọn Vercel đích..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vercelAccounts
                        .filter((a) => a.id !== sourceAccountId)
                        .map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* CLOUDFLARE */}
      {showCloudflare ? (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 transition-all hover:border-amber-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-900/30">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <Cloud className="h-4 w-4" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-amber-200 uppercase tracking-wide">
                  Cloudflare (DNS & Zones)
                </h5>
                <span className="text-[11px] text-zinc-400">
                  Tài khoản và Zone thuộc Cloudflare
                </span>
              </div>
            </div>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-300">
              {cfAccounts.length} tài khoản
            </span>
          </div>

          {cfAccounts.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-2.5 text-xs text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Chưa có tài khoản Cloudflare nào được kết nối. Hãy vào mục{' '}
                <strong>Tài khoản</strong> để thêm Cloudflare API Token.
              </span>
            </div>
          ) : (
            <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Cloudflare Source */}
              <div>
                <label
                  htmlFor="cf-source-account"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Tài khoản Cloudflare Nguồn:
                </label>
                <div className="mt-1">
                  <Select
                    value={sourceAccountId}
                    onValueChange={(val) => {
                      setSourceAccountId(val);
                      setResourceId('');
                    }}
                  >
                    <SelectTrigger id="cf-source-account">
                      <SelectValue placeholder="Chọn Cloudflare nguồn..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cfAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Cloudflare Zone Resource */}
              <div>
                <label
                  htmlFor="cf-resource-zone"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Zone / Domain cần chuyển (Zone):
                </label>
                <div className="mt-1">
                  <Select value={resourceId} onValueChange={setResourceId}>
                    <SelectTrigger id="cf-resource-zone">
                      <SelectValue
                        placeholder={
                          sourceAccountId ? 'Chọn Zone Cloudflare...' : 'Chọn tài khoản nguồn trước'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {cfZones.length === 0 ? (
                        <div className="p-2 text-center text-xs text-zinc-500">
                          {sourceAccountId
                            ? 'Chưa có Zone nào (hãy bấm Đồng bộ ở trang Tài khoản)'
                            : 'Chọn tài khoản nguồn trước'}
                        </div>
                      ) : (
                        cfZones.map((res) => (
                          <SelectItem key={res.id} value={res.id}>
                            {res.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Cloudflare Target */}
              <div>
                <label
                  htmlFor="cf-target-account"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Tài khoản Cloudflare Đích:
                </label>
                <div className="mt-1">
                  <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                    <SelectTrigger id="cf-target-account">
                      <SelectValue placeholder="Chọn Cloudflare đích..." />
                    </SelectTrigger>
                    <SelectContent>
                      {cfAccounts
                        .filter((a) => a.id !== sourceAccountId)
                        .map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* SUPABASE */}
      {showSupabase ? (
        <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4 transition-all hover:border-emerald-800/60">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-900/30">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <Database className="h-4 w-4" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-emerald-200 uppercase tracking-wide">
                  Supabase (Database & Functions)
                </h5>
                <span className="text-[11px] text-zinc-400">Tài khoản và dự án thuộc Supabase</span>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
              {supabaseAccounts.length} tài khoản
            </span>
          </div>

          {supabaseAccounts.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-2.5 text-xs text-emerald-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                Chưa có tài khoản Supabase nào được kết nối. Hãy vào mục <strong>Tài khoản</strong>{' '}
                để thêm Supabase Access Token.
              </span>
            </div>
          ) : (
            <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Supabase Source */}
              <div>
                <label
                  htmlFor="supabase-source-account"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Tài khoản Supabase Nguồn:
                </label>
                <div className="mt-1">
                  <Select
                    value={sourceAccountId}
                    onValueChange={(val) => {
                      setSourceAccountId(val);
                      setResourceId('');
                    }}
                  >
                    <SelectTrigger id="supabase-source-account">
                      <SelectValue placeholder="Chọn Supabase nguồn..." />
                    </SelectTrigger>
                    <SelectContent>
                      {supabaseAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Supabase Resource */}
              <div>
                <label
                  htmlFor="supabase-resource-project"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Dự án Supabase cần chuyển (Project):
                </label>
                <div className="mt-1">
                  <Select value={resourceId} onValueChange={setResourceId}>
                    <SelectTrigger id="supabase-resource-project">
                      <SelectValue
                        placeholder={
                          sourceAccountId ? 'Chọn dự án Supabase...' : 'Chọn tài khoản nguồn trước'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {supabaseProjects.length === 0 ? (
                        <div className="p-2 text-center text-xs text-zinc-500">
                          {sourceAccountId
                            ? 'Chưa có dự án nào (hãy bấm Đồng bộ ở trang Tài khoản)'
                            : 'Chọn tài khoản nguồn trước'}
                        </div>
                      ) : (
                        supabaseProjects.map((res) => (
                          <SelectItem key={res.id} value={res.id}>
                            {res.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Supabase Target */}
              <div>
                <label
                  htmlFor="supabase-target-account"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Tài khoản Supabase Đích:
                </label>
                <div className="mt-1">
                  <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                    <SelectTrigger id="supabase-target-account">
                      <SelectValue placeholder="Chọn Supabase đích..." />
                    </SelectTrigger>
                    <SelectContent>
                      {supabaseAccounts
                        .filter((a) => a.id !== sourceAccountId)
                        .map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* GITLAB */}
      {hasGitLab ? (
        <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 p-4 transition-all hover:border-violet-700/60">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-violet-800/30">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/20 text-violet-300">
                <GitBranch className="h-4 w-4" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-violet-200 uppercase tracking-wide">
                  GitLab (CI/CD Variables & Pipeline Trigger)
                </h5>
                <span className="text-[11px] text-zinc-400">
                  Tài khoản GitLab Project hoặc Personal Access Token
                </span>
              </div>
            </div>
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 font-mono text-[10px] text-violet-300">
              {gitlabAccounts.length} tài khoản
            </span>
          </div>

          <p className="mt-2.5 text-xs text-zinc-300">
            Hệ thống sẽ cập nhật các biến CI/CD{' '}
            <code className="font-mono text-violet-300">VERCEL_TOKEN</code>,{' '}
            <code className="font-mono text-violet-300">VERCEL_ORG_ID</code>, và{' '}
            <code className="font-mono text-violet-300">VERCEL_PROJECT_ID</code> trên dự án GitLab
            chỉ định, sau đó kích hoạt pipeline deploy sang tài khoản Vercel đích.
          </p>

          {gitlabAccounts.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-800/60 bg-amber-950/40 p-2.5 text-xs text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Chưa có tài khoản GitLab nào được kết nối. Hãy vào mục <strong>Tài khoản</strong> để
                thêm GitLab Token trước khi thực hiện bước này.
              </span>
            </div>
          ) : (
            <div className="mt-3.5 space-y-3">
              {/* Account Selector with Token Type Badges */}
              <div className="max-w-md">
                <label
                  htmlFor="mig-gitlab-account"
                  className="block text-xs font-medium text-zinc-300"
                >
                  Chọn Tài khoản GitLab:
                </label>
                <div className="mt-1">
                  <Select value={gitlabAccountId} onValueChange={setGitlabAccountId}>
                    <SelectTrigger id="mig-gitlab-account">
                      <SelectValue placeholder="Chọn tài khoản GitLab..." />
                    </SelectTrigger>
                    <SelectContent>
                      {gitlabAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.label} ({acc.accountType === 'user' ? 'User Token' : 'Project Token'}
                          )
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Intelligent Adaption based on Token Type */}
              {isProjectToken ? (
                <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-2.5 text-xs text-zinc-300">
                  <div className="flex items-center gap-2 font-medium text-emerald-400">
                    <span>Dự án gắn liền theo Project Token</span>
                    {selectedGitLabAccount?.externalAccountId &&
                    selectedGitLabAccount.externalAccountId !== 'gitlab-token' ? (
                      <span className="font-mono text-[11px] text-zinc-300">
                        (ID: {selectedGitLabAccount.externalAccountId})
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Token này được tạo trực tiếp từ Repository GitLab. Hệ thống sẽ tự động cập nhật
                    và kích hoạt deploy cho đúng dự án này.
                  </p>
                </div>
              ) : isUserToken ? (
                <div className="max-w-md space-y-1.5 rounded-lg border border-violet-900/40 bg-zinc-950/60 p-3">
                  <label
                    htmlFor="mig-gitlab-project"
                    className="block text-xs font-medium text-zinc-300"
                  >
                    Dự án GitLab cần deploy (Project ID hoặc Path):
                  </label>
                  {gitlabProjects.length > 0 && setGitlabProjectId ? (
                    <Select
                      value={gitlabProjectId}
                      onValueChange={(val) => setGitlabProjectId(val)}
                    >
                      <SelectTrigger id="mig-gitlab-project" className="h-8 text-xs">
                        <SelectValue placeholder="Chọn từ dự án đã đồng bộ..." />
                      </SelectTrigger>
                      <SelectContent>
                        {gitlabProjects.map((p) => (
                          <SelectItem key={p.id} value={p.externalId}>
                            {p.name} (ID: {p.externalId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {setGitlabProjectId ? (
                    <input
                      type="text"
                      value={gitlabProjectId ?? ''}
                      onChange={(e) => setGitlabProjectId(e.target.value)}
                      placeholder="VD: 12345678 hoặc group/my-repo"
                      className="h-8 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  ) : null}
                  <p className="text-[10px] text-zinc-400">
                    * Tài khoản User quản lý nhiều dự án. Vui lòng chọn hoặc nhập dự án cần thao
                    tác.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-3 rounded-lg border border-violet-900/50 bg-zinc-950/60 p-2.5 text-[11px] text-zinc-300 space-y-1">
            <div className="font-semibold text-amber-300">
              Yêu cầu quyền hạn tối thiểu của GitLab Token:
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-zinc-400">
              <li>
                <strong>Quyền Role:</strong> Bắt buộc chọn{' '}
                <span className="text-zinc-200 font-mono font-medium">Maintainer</span> hoặc{' '}
                <span className="text-zinc-200 font-mono font-medium">Developer</span> (để có quyền
                ghi CI/CD Variables và Trigger Pipeline).
              </li>
              <li>
                <strong>Phạm vi Scopes:</strong> Tích chọn{' '}
                <span className="text-emerald-300 font-mono font-medium">api</span>.
              </li>
              <li>
                <strong>Biến CI/CD:</strong> Trong <em>Settings &gt; CI/CD &gt; Variables</em>, nếu
                branch triển khai không phải Protected Branch, hãy bỏ tích{' '}
                <em>Protected variable</em> để pipeline có thể đọc được.
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
};
