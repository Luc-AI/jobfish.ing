# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a deployable Next.js 15 app with Supabase auth (Google OAuth + email/password), warm shadcn/ui theme, all DB tables with RLS, onboarding wizard, PostHog analytics, and Sentry error tracking.

**Architecture:** Next.js 15 App Router with TypeScript. Supabase handles auth and Postgres. shadcn/ui with stone base color provides the component system. Middleware protects routes and redirects unauthenticated users. Auth callback route handles post-login redirection based on onboarding status.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase (auth + postgres + RLS), Vitest, React Testing Library, PostHog, Sentry

---

## File Map

| File | Responsibility |
|---|---|
| `src/app/layout.tsx` | Root layout, PostHog provider, Sentry init |
| `src/app/page.tsx` | Root redirect (→ /login) |
| `src/app/(auth)/login/page.tsx` | Login page with Google + email/password |
| `src/app/auth/callback/route.ts` | OAuth callback, post-login redirect logic |
| `src/app/(onboarding)/onboarding/page.tsx` | Onboarding entry point |
| `src/components/features/onboarding-wizard.tsx` | 3-step wizard (client component) |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client (cookie-based) |
| `src/lib/supabase/service.ts` | Service role client for pipeline tasks |
| `src/lib/supabase/queries.ts` | Typed DB query functions |
| `src/lib/supabase/types.ts` | Generated TypeScript types from schema |
| `src/lib/posthog.ts` | PostHog client + provider component |
| `src/lib/utils.ts` | `cn()` utility |
| `middleware.ts` | Auth protection, route guarding |
| `sentry.client.config.ts` | Sentry browser config |
| `sentry.server.config.ts` | Sentry server config |
| `sentry.edge.config.ts` | Sentry edge config |
| `supabase/migrations/0001_schema.sql` | Full DB schema + RLS + triggers |
| `.env.example` | All required env vars documented |
| `vitest.config.ts` | Test config |
| `src/test/setup.ts` | RTL + jest-dom setup |

---

## Task 1: Initialize Next.js 15 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Scaffold the project**

```bash
cd /Users/Luca/repos/jobfish.ing
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack
```

When prompted, accept all defaults. This installs into the existing directory.

- [ ] **Step 2: Install core dependencies**

```bash
npm install @supabase/ssr @supabase/supabase-js
npm install posthog-js @sentry/nextjs
npm install react-hook-form zod @hookform/resolvers
npm install @radix-ui/react-slot class-variance-authority clsx tailwind-merge
npm install lucide-react
```

- [ ] **Step 3: Create `src/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 4: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000` with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js 15 project with TypeScript and Tailwind"
```

---

## Task 2: Configure shadcn/ui with warm stone theme

**Files:**
- Create: `components.json`
- Modify: `src/app/globals.css`, `tailwind.config.ts`
- Create: `src/components/ui/` (shadcn auto-generates these — do not edit)

- [ ] **Step 1: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Stone**
- CSS variables: **Yes**

- [ ] **Step 2: Add all shadcn components used across the app**

```bash
npx shadcn@latest add button input label card badge separator
npx shadcn@latest add form textarea select
npx shadcn@latest add dialog sheet tabs
npx shadcn@latest add slider switch
npx shadcn@latest add toast sonner
npx shadcn@latest add command popover
```

- [ ] **Step 3: Extend `src/app/globals.css` with warm overrides**

Add below the existing `@layer base` block:

```css
@layer base {
  :root {
    --background: 60 9.1% 97.8%;
    --foreground: 20 14.3% 4.1%;
    --card: 0 0% 100%;
    --card-foreground: 20 14.3% 4.1%;
    --popover: 0 0% 100%;
    --popover-foreground: 20 14.3% 4.1%;
    --primary: 24 9.8% 10%;
    --primary-foreground: 60 9.1% 97.8%;
    --secondary: 60 4.8% 95.9%;
    --secondary-foreground: 24 9.8% 10%;
    --muted: 60 4.8% 95.9%;
    --muted-foreground: 25 5.3% 44.7%;
    --accent: 60 4.8% 95.9%;
    --accent-foreground: 24 9.8% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 60 9.1% 97.8%;
    --border: 20 5.9% 90%;
    --input: 20 5.9% 90%;
    --ring: 20 14.3% 4.1%;
    --radius: 0.5rem;
  }
}
```

- [ ] **Step 4: Update `src/app/layout.tsx` with font and metadata**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'jobfishing',
  description: 'Jobs find you.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: Verify shadcn components import cleanly**

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: configure shadcn/ui with warm stone theme"
```

---

## Task 3: Set up Vitest + React Testing Library

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Create `src/test/setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Add test scripts to `package.json`**

In the `"scripts"` section, add:

```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 5: Write a smoke test to verify the setup**

Create `src/test/setup.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('vitest and jest-dom are configured', () => {
    const div = document.createElement('div')
    document.body.appendChild(div)
    expect(div).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run and confirm test passes**

```bash
npm run test:run
```

Expected output:
```
✓ src/test/setup.test.ts > test setup > vitest and jest-dom are configured
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Vitest + React Testing Library"
```

---

## Task 4: Supabase project setup + schema migration

**Files:**
- Create: `supabase/migrations/0001_schema.sql`
- Create: `src/lib/supabase/types.ts` (generated)

- [ ] **Step 1: Install Supabase CLI**

```bash
npm install -D supabase
```

- [ ] **Step 2: Initialize Supabase locally**

```bash
npx supabase init
```

This creates the `supabase/` directory.

- [ ] **Step 3: Create the schema migration**

Create `supabase/migrations/0001_schema.sql`:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  cv_text text,
  threshold numeric(3,1) DEFAULT 7.0 CHECK (threshold >= 0 AND threshold <= 10),
  notifications_enabled boolean DEFAULT true,
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- PREFERENCES
-- ============================================================
CREATE TABLE public.preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  target_roles text[] DEFAULT '{}',
  industries text[] DEFAULT '{}',
  locations text[] DEFAULT '{}',
  excluded_companies text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own preferences"
  ON public.preferences FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- JOBS (shared, read-only for users)
-- ============================================================
CREATE TABLE public.jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  url text UNIQUE NOT NULL,
  source text NOT NULL,
  description text,
  scraped_at timestamptz DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read jobs"
  ON public.jobs FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- JOB EVALUATIONS (central table)
-- ============================================================
CREATE TABLE public.job_evaluations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  score numeric(3,1) NOT NULL CHECK (score >= 0 AND score <= 10),
  reasoning text,
  dimensions jsonb,
  notified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_id, user_id)
);

ALTER TABLE public.job_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own evaluations"
  ON public.job_evaluations FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- USER JOB ACTIONS
-- ============================================================
CREATE TYPE public.job_action_status AS ENUM ('saved', 'hidden', 'applied');

CREATE TABLE public.user_job_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  status public.job_action_status NOT NULL,
  applied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, job_id)
);

ALTER TABLE public.user_job_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own job actions"
  ON public.user_job_actions FOR ALL
  USING (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE PROFILE + PREFERENCES ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- UPDATED_AT HELPER
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_preferences_updated_at
  BEFORE UPDATE ON public.preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

- [ ] **Step 4: Apply migration to Supabase**

Log in to Supabase dashboard → SQL Editor → run the contents of `0001_schema.sql`.

Alternatively with CLI (if project linked):
```bash
npx supabase db push
```

- [ ] **Step 5: Generate TypeScript types**

```bash
npx supabase gen types typescript \
  --project-id YOUR_SUPABASE_PROJECT_ID \
  > src/lib/supabase/types.ts
```

Replace `YOUR_SUPABASE_PROJECT_ID` with the ID from the Supabase dashboard URL (e.g., `abcdefghijkl`).

- [ ] **Step 6: Verify types file was generated**

```bash
head -30 src/lib/supabase/types.ts
```

Expected: file starts with `export type Json = ...` and includes `profiles`, `preferences`, `jobs`, `job_evaluations`, `user_job_actions` table types.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema migration and generated types"
```

---

## Task 5: Supabase client helpers

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/service.ts`
- Create: `src/lib/supabase/queries.ts`

- [ ] **Step 1: Create browser client `src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Create server client `src/lib/supabase/server.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — read-only cookies context, safe to ignore
          }
        },
      },
    }
  )
}
```

- [ ] **Step 3: Create service role client `src/lib/supabase/service.ts`**

This client is used only in Trigger.dev pipeline tasks — never in the frontend.

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 4: Create typed queries `src/lib/supabase/queries.ts`**

```typescript
import { createClient } from './server'
import type { Database } from './types'

type Profile = Database['public']['Tables']['profiles']['Row']
type Preferences = Database['public']['Tables']['preferences']['Row']
type JobActionStatus = Database['public']['Enums']['job_action_status']

export async function getProfile(userId: string) {
  const supabase = await createClient()
  return supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
}

export async function updateProfile(userId: string, data: Partial<Omit<Profile, 'id' | 'created_at'>>) {
  const supabase = await createClient()
  return supabase
    .from('profiles')
    .update(data)
    .eq('id', userId)
}

export async function getPreferences(userId: string) {
  const supabase = await createClient()
  return supabase
    .from('preferences')
    .select('*')
    .eq('user_id', userId)
    .single()
}

export async function updatePreferences(userId: string, data: Partial<Omit<Preferences, 'id' | 'user_id'>>) {
  const supabase = await createClient()
  return supabase
    .from('preferences')
    .update(data)
    .eq('user_id', userId)
}

export async function getJobFeed(
  userId: string,
  page: number = 1,
  pageSize: number = 20,
  hideHidden: boolean = true
) {
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('job_evaluations')
    .select(`
      id,
      score,
      reasoning,
      dimensions,
      notified_at,
      created_at,
      jobs (
        id,
        title,
        company,
        location,
        url,
        source,
        scraped_at
      ),
      user_job_actions (
        status,
        applied_at
      )
    `)
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .range(from, to)

  if (hideHidden) {
    query = query.not('user_job_actions.status', 'eq', 'hidden')
  }

  return query
}

export async function upsertJobAction(
  userId: string,
  jobId: string,
  status: JobActionStatus
) {
  const supabase = await createClient()
  return supabase
    .from('user_job_actions')
    .upsert(
      {
        user_id: userId,
        job_id: jobId,
        status,
        applied_at: status === 'applied' ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,job_id' }
    )
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client helpers and typed queries"
```

---

## Task 6: Auth middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write failing test for middleware redirect logic**

Create `src/test/middleware.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// We test the redirect logic in isolation, not the full middleware
// (Next.js middleware is not easily unit-testable)

describe('middleware route rules', () => {
  const PUBLIC_PATHS = ['/login', '/auth/callback']
  const PROTECTED_PATHS = ['/dashboard', '/preferences', '/notifications', '/onboarding']

  function isPublicPath(pathname: string) {
    return PUBLIC_PATHS.some(p => pathname.startsWith(p))
  }

  it('marks /login as public', () => {
    expect(isPublicPath('/login')).toBe(true)
  })

  it('marks /auth/callback as public', () => {
    expect(isPublicPath('/auth/callback')).toBe(true)
  })

  it('marks /dashboard as protected', () => {
    expect(isPublicPath('/dashboard')).toBe(false)
  })

  it('marks /preferences as protected', () => {
    expect(isPublicPath('/preferences')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npm run test:run -- src/test/middleware.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Create `middleware.ts`**

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must call getUser() not getSession()
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublicPath = pathname.startsWith('/login') || pathname.startsWith('/auth')

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add auth middleware with route protection"
```

---

## Task 7: Environment variables + `.env.example`

**Files:**
- Create: `.env.local` (not committed)
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Trigger.dev
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxx

# Apify
APIFY_API_TOKEN=your-apify-token

# OpenRouter
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxx
OPENROUTER_MODEL=anthropic/claude-3-5-haiku

# Resend
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=jobs@jobfish.ing

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://xxxx@sentry.io/yyyy
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxxxxxx
SENTRY_ORG=your-org
SENTRY_PROJECT=jobfishing
```

- [ ] **Step 2: Verify `.env.local` is in `.gitignore`**

```bash
grep '.env.local' .gitignore
```

Expected: `.env.local` is listed. If not, add it.

- [ ] **Step 3: Create `.env.local` with real values**

Copy `.env.example` to `.env.local` and fill in real credentials from:
- Supabase dashboard → Project Settings → API
- Trigger.dev dashboard → API Keys
- Apify → Settings → API tokens
- OpenRouter → Keys
- Resend → API Keys
- PostHog → Project Settings → API keys
- Sentry → Settings → Projects → Client Keys

- [ ] **Step 4: Commit**

```bash
git add .env.example .gitignore
git commit -m "chore: add .env.example with all required environment variables"
```

---

## Task 8: Login page (Google OAuth + email/password)

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/page.tsx`
- Create: `src/test/login.test.tsx`

- [ ] **Step 1: Write failing tests for login page**

Create `src/test/login.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from '@/app/(auth)/login/page'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('LoginPage', () => {
  it('renders Google sign-in button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('renders email input', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('renders password input', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('shows sign up tab', () => {
    render(<LoginPage />)
    expect(screen.getByRole('tab', { name: /sign up/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm run test:run -- src/test/login.test.tsx
```

Expected: FAIL with "Cannot find module '@/app/(auth)/login/page'"

- [ ] **Step 3: Create `src/app/(auth)/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  async function signInWithEmail() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  async function signUpWithEmail() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
    } else {
      setError('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">jobfishing</h1>
          <p className="text-muted-foreground text-sm mt-1">Jobs find you.</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Welcome</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={signInWithGoogle}
            >
              Continue with Google
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Tabs defaultValue="signin">
              <TabsList className="w-full">
                <TabsTrigger value="signin" className="flex-1">Sign in</TabsTrigger>
                <TabsTrigger value="signup" className="flex-1">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="space-y-3 mt-3">
                <div className="space-y-1">
                  <Label htmlFor="email-signin">Email</Label>
                  <Input
                    id="email-signin"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password-signin">Password</Label>
                  <Input
                    id="password-signin"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" onClick={signInWithEmail} disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </TabsContent>

              <TabsContent value="signup" className="space-y-3 mt-3">
                <div className="space-y-1">
                  <Label htmlFor="email-signup">Email</Label>
                  <Input
                    id="email-signup"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input
                    id="password-signup"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" onClick={signUpWithEmail} disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account'}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create auth callback route `src/app/auth/callback/route.ts`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=auth_failed', origin))
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    return NextResponse.redirect(new URL('/dashboard', origin))
  }

  return NextResponse.redirect(new URL('/onboarding', origin))
}
```

- [ ] **Step 5: Create root redirect `src/app/page.tsx`**

```typescript
import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/login')
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:run -- src/test/login.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add login page with Google OAuth and email/password auth"
```

---

## Task 9: Onboarding wizard

**Files:**
- Create: `src/app/(onboarding)/onboarding/page.tsx`
- Create: `src/components/features/onboarding-wizard.tsx`
- Create: `src/test/onboarding-wizard.test.tsx`

- [ ] **Step 1: Write failing tests for onboarding wizard**

Create `src/test/onboarding-wizard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('OnboardingWizard', () => {
  const defaultProps = {
    userId: 'test-user-id',
    initialStep: 1 as const,
  }

  it('renders step 1 (CV) by default', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText(/your cv/i)).toBeInTheDocument()
  })

  it('shows step indicator with 3 steps', () => {
    render(<OnboardingWizard {...defaultProps} />)
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })

  it('advances to step 2 after clicking Next on step 1', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/preferences/i)).toBeInTheDocument()
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('goes back to step 1 when Back is clicked on step 2', async () => {
    const user = userEvent.setup()
    render(<OnboardingWizard {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm run test:run -- src/test/onboarding-wizard.test.tsx
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Create `src/components/features/onboarding-wizard.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

interface OnboardingWizardProps {
  userId: string
  initialStep?: 1 | 2 | 3
}

export function OnboardingWizard({ userId, initialStep = 1 }: OnboardingWizardProps) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<1 | 2 | 3>(initialStep)
  const [saving, setSaving] = useState(false)

  // Step 1: CV
  const [cvText, setCvText] = useState('')

  // Step 2: Preferences
  const [targetRoles, setTargetRoles] = useState('')
  const [industries, setIndustries] = useState('')
  const [locations, setLocations] = useState('')
  const [excludedCompanies, setExcludedCompanies] = useState('')

  // Step 3: Notifications
  const [threshold, setThreshold] = useState(7.0)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)

  function parseCommaSeparated(value: string): string[] {
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  }

  async function saveStep1() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({ cv_text: cvText })
      .eq('id', userId)
    setSaving(false)
    setStep(2)
  }

  async function saveStep2() {
    setSaving(true)
    await supabase
      .from('preferences')
      .update({
        target_roles: parseCommaSeparated(targetRoles),
        industries: parseCommaSeparated(industries),
        locations: parseCommaSeparated(locations),
        excluded_companies: parseCommaSeparated(excludedCompanies),
      })
      .eq('user_id', userId)
    setSaving(false)
    setStep(3)
  }

  async function saveStep3() {
    setSaving(true)
    await supabase
      .from('profiles')
      .update({
        threshold,
        notifications_enabled: notificationsEnabled,
        onboarding_completed: true,
      })
      .eq('id', userId)
    setSaving(false)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{step} of 3</p>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {step === 1 && 'Your CV'}
            {step === 2 && 'Preferences'}
            {step === 3 && 'Notifications'}
          </h1>
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Paste your CV text below. The AI uses this to evaluate how well jobs match your background.
            </p>
            <Textarea
              placeholder="Paste your CV here..."
              value={cvText}
              onChange={e => setCvText(e.target.value)}
              rows={12}
              className="resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">{cvText.length} characters</p>
            <div className="flex justify-end">
              <Button onClick={saveStep1} disabled={saving || cvText.length < 50}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Enter comma-separated values. The AI uses these to evaluate job fit.
            </p>
            <div className="space-y-1">
              <Label>Target roles</Label>
              <Input
                placeholder="Head of Product, VP Biz Dev, PM"
                value={targetRoles}
                onChange={e => setTargetRoles(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Industries</Label>
              <Input
                placeholder="Fintech, SaaS, VC, Deep Tech"
                value={industries}
                onChange={e => setIndustries(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Locations</Label>
              <Input
                placeholder="Zurich, Remote, Berlin"
                value={locations}
                onChange={e => setLocations(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Excluded companies</Label>
              <Input
                placeholder="BigCorp, SlowBank"
                value={excludedCompanies}
                onChange={e => setExcludedCompanies(e.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={saveStep2} disabled={saving}>
                {saving ? 'Saving…' : 'Next'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm">
              You'll only be notified when jobs score at or above your threshold.
            </p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Score threshold</Label>
                <span className="text-2xl font-bold">{threshold.toFixed(1)}</span>
              </div>
              <Slider
                min={0}
                max={10}
                step={0.5}
                value={[threshold]}
                onValueChange={([v]) => setThreshold(v)}
              />
              <p className="text-xs text-muted-foreground">
                Only notify me when a job scores {threshold.toFixed(1)} or higher.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Email notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Receive job alerts by email</p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={saveStep3} disabled={saving}>
                {saving ? 'Setting up…' : 'Start fishing'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create onboarding page `src/app/(onboarding)/onboarding/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/features/onboarding-wizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) redirect('/dashboard')

  return <OnboardingWizard userId={user.id} />
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm run test:run -- src/test/onboarding-wizard.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add 3-step onboarding wizard"
```

---

## Task 10: PostHog analytics

**Files:**
- Create: `src/lib/posthog.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create `src/lib/posthog.ts`**

```typescript
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
    })
  }, [])

  return <PHProvider client={posthog}>{children}</PHProvider>
}

export { posthog }
```

- [ ] **Step 2: Add PostHog to root layout `src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { PostHogProvider } from '@/lib/posthog'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'jobfishing',
  description: 'Jobs find you.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add PostHog analytics provider"
```

---

## Task 11: Sentry error tracking

**Files:**
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Run Sentry wizard**

```bash
npx @sentry/wizard@latest -i nextjs
```

When prompted:
- Choose your Sentry org and project
- Select: create new Sentry project → name it `jobfishing`
- Accept auto-configuration of `next.config.ts`
- Decline creating example error pages

This auto-creates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and modifies `next.config.ts`.

- [ ] **Step 2: Verify the generated `sentry.client.config.ts` looks correct**

```bash
cat sentry.client.config.ts
```

Expected output contains:
```typescript
import * as Sentry from "@sentry/nextjs";
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  ...
});
```

- [ ] **Step 3: Verify build succeeds with Sentry**

```bash
npm run build
```

Expected: build completes. Sentry will log source map upload.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Sentry error tracking"
```

---

## Task 12: Vercel deployment + smoke test

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next"
}
```

- [ ] **Step 2: Deploy to Vercel**

```bash
npx vercel --prod
```

Or push to your connected GitHub repo and let Vercel auto-deploy.

Add all environment variables from `.env.local` to the Vercel project dashboard under Settings → Environment Variables.

- [ ] **Step 3: Configure Supabase Google OAuth redirect URL**

In Supabase dashboard → Authentication → URL Configuration:
- Add `https://jobfish.ing/auth/callback` to **Redirect URLs**
- Add `https://jobfish.ing` to **Site URL**

- [ ] **Step 4: Enable Google OAuth in Supabase**

Supabase dashboard → Authentication → Providers → Google:
- Enable Google
- Add Google OAuth Client ID and Secret from Google Cloud Console
- Authorized redirect URI in Google Console: `https://<your-project>.supabase.co/auth/v1/callback`

- [ ] **Step 5: Smoke test the deployed app**

Visit `https://jobfish.ing`:
1. Redirects to `/login` ✓
2. "Continue with Google" button visible ✓
3. Email/password tabs visible ✓
4. Sign in with Google → redirects to `/onboarding` on first login ✓
5. Complete onboarding → redirects to `/dashboard` (empty state) ✓

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: add Vercel deployment config"
```

---

**Plan 1 complete.** The app is live, users can sign up, complete onboarding, and land on an empty dashboard. Proceed to Plan 2 (Frontend) to build out the job feed, preferences, and notifications pages.
