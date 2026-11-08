import { MIGRATION_TEMPLATE, type MigrationTemplate } from '@freetier-loop/shared';
import {
  ArrowRightLeft,
  Cloud,
  Cpu,
  Database,
  FileCode,
  GitBranch,
  Globe,
  Play,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';

export interface ModularAction {
  id: string;
  name: string;
  category: 'vercel' | 'cloudflare' | 'gitlab' | 'supabase';
  badge: string;
  description: string;
  icon: typeof Cloud;
}

export interface PipelineStepItem {
  id: string;
  actionId: string;
}

let stepCounter = 0;
export const createStepItem = (actionId: string): PipelineStepItem => ({
  id: `step_${Date.now()}_${++stepCounter}`,
  actionId,
});

export interface PrebuiltTemplate {
  id: MigrationTemplate;
  name: string;
  category: 'vercel' | 'cloudflare' | 'supabase' | 'cross';
  badge: string;
  description: string;
  defaultSteps: string[];
  icon: typeof Cloud;
}

export interface SavedMigration {
  id: string;
  name: string;
  template: MigrationTemplate;
  sourceAccountId: string;
  targetAccountId: string;
  resourceId: string;
  gitlabAccountId?: string | undefined;
  steps: string[];
  createdAt: number;
}

export const MODULAR_ACTIONS: ModularAction[] = [
  {
    id: 'vercel.move-domains',
    name: 'Chuyển Custom Domain',
    category: 'vercel',
    badge: 'Domain Cutover',
    description: 'Gỡ custom domain khỏi project ở Account 1 và gắn vào project ở Account 2.',
    icon: Globe,
  },
  {
    id: 'vercel.sync-rules',
    name: 'Đồng bộ Vercel Rules',
    category: 'vercel',
    badge: 'Rules & Routing',
    description: 'Sao chép toàn bộ rewrites, redirects, custom headers, cleanUrls sang Account 2.',
    icon: SlidersHorizontal,
  },
  {
    id: 'gitlab.rewire-vars',
    name: 'Cập nhật GitLab CI/CD Variables',
    category: 'gitlab',
    badge: 'GitLab CI/CD',
    description:
      'Tự động đọc và ghi đè VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID trên GitLab repo.',
    icon: GitBranch,
  },
  {
    id: 'gitlab.trigger-pipeline',
    name: 'Kích hoạt Deploy GitLab (CI/CD)',
    category: 'gitlab',
    badge: 'GitLab Pipeline',
    description:
      'Trigger pipeline CI/CD trên GitLab để build và deploy commit mới nhất lên Vercel đích.',
    icon: Play,
  },
  {
    id: 'vercel.create-project',
    name: 'Tạo mới Vercel Project',
    category: 'vercel',
    badge: 'Recreate',
    description: 'Tạo mới project trên Account 2 từ git repository của project cũ.',
    icon: Zap,
  },
  {
    id: 'vercel.upsert-env',
    name: 'Sao chép Environment Variables',
    category: 'vercel',
    badge: 'Env Vars',
    description: 'Sao chép các biến môi trường cấu hình giữa 2 project Vercel.',
    icon: FileCode,
  },
  {
    id: 'vercel.trigger-deploy',
    name: 'Kích hoạt Deploy Vercel',
    category: 'vercel',
    badge: 'Deployment',
    description: 'Trigger deployment mới trên Vercel sau khi hoàn thành cutover.',
    icon: Play,
  },
  {
    id: 'cf.create-target-zone',
    name: 'Tạo Cloudflare Zone mới',
    category: 'cloudflare',
    badge: 'CF Zone',
    description: 'Tạo zone mới trên tài khoản Cloudflare đích.',
    icon: Cloud,
  },
  {
    id: 'cf.batch-import-dns',
    name: 'Sao chép toàn bộ DNS Records',
    category: 'cloudflare',
    badge: 'DNS Clone',
    description: 'Import tự động các bản ghi DNS sang zone mới.',
    icon: ArrowRightLeft,
  },
  {
    id: 'cf.restore-zone-settings',
    name: 'Đồng bộ Cấu hình Zone (SSL/TLS)',
    category: 'cloudflare',
    badge: 'CF Settings',
    description: 'Sao chép các thiết lập SSL, Minify, Security sang zone đích.',
    icon: Cpu,
  },
  {
    id: 'dns.repoint-records',
    name: 'Repoint DNS Records',
    category: 'cloudflare',
    badge: 'DNS Routing',
    description: 'Repoint DNS A/CNAME records sang đích mới.',
    icon: ArrowRightLeft,
  },
  {
    id: 'env.rewire-vars',
    name: 'Cập nhật cấu hình Backend',
    category: 'supabase',
    badge: 'Config',
    description: 'Cập nhật các chuỗi kết nối Database / API keys sang frontend apps.',
    icon: Database,
  },
];

export const PREBUILT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: MIGRATION_TEMPLATE.VERCEL_GITLAB_CUTOVER,
    name: 'Cập nhật Token ➔ Deploy GitLab ➔ Transfer Vercel',
    category: 'vercel',
    badge: 'GitLab + Vercel',
    description:
      'Cập nhật Vercel Token trên GitLab CI/CD, kích hoạt pipeline deploy code mới nhất lên Vercel mới, sau đó chuyển custom domain.',
    defaultSteps: [
      'gitlab.rewire-vars',
      'gitlab.trigger-pipeline',
      'vercel.sync-rules',
      'vercel.move-domains',
    ],
    icon: GitBranch,
  },
  {
    id: MIGRATION_TEMPLATE.VERCEL_PROJECT_RECREATE,
    name: 'Vercel Project Recreate & Deploy',
    category: 'vercel',
    badge: 'Tái tạo Project',
    description: 'Tạo mới project, sao chép env vars, trigger deploy và gắn custom domain.',
    defaultSteps: [
      'vercel.create-project',
      'vercel.upsert-env',
      'vercel.trigger-deploy',
      'vercel.move-domains',
    ],
    icon: Zap,
  },
  {
    id: MIGRATION_TEMPLATE.VERCEL_DOMAIN_MOVE,
    name: 'Chỉ chuyển Vercel Custom Domain',
    category: 'vercel',
    badge: 'Chỉ chuyển Domain',
    description: 'Gỡ custom domain khỏi project nguồn và gán sang project đích.',
    defaultSteps: ['vercel.move-domains'],
    icon: Globe,
  },
  {
    id: MIGRATION_TEMPLATE.CF_ZONE_MOVE,
    name: 'Cloudflare Zero-Downtime Zone Move',
    category: 'cloudflare',
    badge: 'Cloudflare DNS',
    description: 'Tạo zone đích, import toàn bộ DNS records và đồng bộ cấu hình SSL/TLS.',
    defaultSteps: ['cf.create-target-zone', 'cf.batch-import-dns', 'cf.restore-zone-settings'],
    icon: Cloud,
  },
  {
    id: MIGRATION_TEMPLATE.DNS_REPOINT,
    name: 'Repoint DNS & Backend Config',
    category: 'cross',
    badge: 'DNS & Config',
    description: 'Cập nhật bản ghi DNS và chuỗi kết nối Database/API.',
    defaultSteps: ['dns.repoint-records', 'env.rewire-vars'],
    icon: ArrowRightLeft,
  },
];
