---
trigger: model_decision
description: Rules for the React + Vite SPA — folder structure, bento grid UI, data fetching, forms, Turnstile, accessibility. Read before editing apps/web.
---

# Frontend (React + Vite) rules

## Structure (feature-sliced)
```
apps/web/src/
├─ app/            # providers (QueryClient, Router, Theme), root layout, error boundary
├─ routes/         # TanStack Router file-based routes (thin: compose features)
├─ features/<feature>/
│  ├─ api/         # query/mutation hooks built on the RPC client + query keys
│  ├─ components/  # feature UI
│  └─ model/       # local types, mappers, constants specific to the feature
├─ components/
│  ├─ ui/          # shadcn/ui primitives (generated; do not hand-edit except theming)
│  └─ bento/       # BentoGrid, BentoCard, BentoStat, BentoSkeleton
├─ lib/            # rpc client (hc<AppType>), auth-client, query-keys factory, formatters
└─ config/         # env.ts (Zod-parsed import.meta.env)
```

## Bento grid design system
- Single reusable `BentoGrid` (CSS grid, `grid-cols-1 md:grid-cols-4 xl:grid-cols-6`, `auto-rows-[minmax(140px,auto)]`, gap-4)
  and `BentoCard` with `size` prop from `BENTO_SIZE` constant (`sm` 1×1, `md` 2×1, `lg` 2×2, `xl` 4×2, `full`).
  Never hand-write grid spans in pages; pick a size.
- Every card: title, optional icon, optional action slot, body; built-in loading skeleton & error state.
- Dashboard = bento of: quota/usage per account, accounts health, domains summary, running jobs,
  recent audit log, quick actions (New migration, Add account, Sync all).
- Design tokens via Tailwind v4 `@theme` (CSS vars); dark mode first, light supported. Icons: lucide-react.
- Responsive down to 360px; keyboard navigable; visible focus; color contrast AA.

## Data fetching
- Server state only through TanStack Query; never `useEffect` + fetch.
- Typed client: `hc<AppType>(env.VITE_API_BASE_URL, { init: { credentials: 'include' } })`.
- Query keys from a single factory `queryKeys.<feature>.<scope>(params)`.
- Mutations invalidate precise keys; destructive mutations show a confirm dialog with typed confirmation.
- Errors: map `error.code` (shared `ERROR_CODE`) → user message in one `errorMessages` map.

## Forms
- react-hook-form + `zodResolver(sharedSchema)` — reuse the same Zod schema as the API.
- Show field errors inline; disable submit while pending.

## Auth & Turnstile
- `authClient = createAuthClient({ baseURL })` from `better-auth/react`; session via `useSession`.
- Route guard in the router `beforeLoad` → redirect to `WEB_ROUTES.LOGIN` when no session.
- Login page renders Turnstile (`@marsidev/react-turnstile`) with `VITE_TURNSTILE_SITE_KEY`; submit is
  disabled until a token exists; token is sent as header `x-captcha-response`; widget resets after each attempt.
- No sign-up page, no "create account" link anywhere.

## UI primitives & styling
- Headless / custom primitives (`components/ui/*`): Use Radix UI + Tailwind (`clsx` + `tailwind-merge`) shadcn-style components (`Select`, `Dialog`, `DropdownMenu`, `Tabs`, `Tooltip`, etc.).
- **DO NOT** use unstyled, raw browser-native `<select>` or unstyled controls in the application UI. Keep UI consistent with the dark/light design system.
- **Cursor pointer & interactive states**:
  - Global base CSS enforces `cursor: pointer` on `button:not(:disabled)`, `[role="button"]:not([aria-disabled="true"])`, `select`, `a[href]`, `label[for]`, and `summary`, plus `cursor: not-allowed` on disabled states.
  - Any custom clickable element (e.g. clickable card, list item, custom tab) must have explicit `cursor-pointer` (or `cursor-not-allowed` when disabled) and visible keyboard focus ring (`focus-visible:ring-2`).

## Code style
- Function components, named exports, props typed with `type XProps = {...}`.
- No inline magic strings for routes/status/labels — use shared constants & label maps.
- Components ≤ ~150 lines; extract hooks for logic. Avoid prop drilling > 2 levels (use composition/context).

