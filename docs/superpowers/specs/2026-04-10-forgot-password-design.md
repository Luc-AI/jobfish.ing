---
title: Forgot Password Flow
date: 2026-04-10
status: approved
---

# Forgot Password Flow

## Overview

Add a standard password reset flow to the login page. Users who forget their password can request a reset email, then land on a dedicated page to set a new password.

## User Flow

1. User clicks "Forgot password?" link on the sign-in tab of `/login`
2. Navigated to `/forgot-password` — enters email, submits
3. Supabase sends a reset email; page shows "Check your email" confirmation
4. User clicks the link in the email → redirected to `/auth/callback?next=/reset-password`
5. Callback exchanges the code for a session, then redirects to `/reset-password`
6. User enters new password → `supabase.auth.updateUser({ password })` → redirect to `/dashboard`

## Files

### New

- `src/app/(auth)/forgot-password/page.tsx`
  - Client component, same card/layout as login page
  - Email input + submit button
  - Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/auth/callback?next=/reset-password\` })`
  - On success: replace form with "Check your email" message
  - On error: show error inline (same `text-destructive` pattern as login page)

- `src/app/(auth)/reset-password/page.tsx`
  - Client component, same card/layout as login page
  - New password input + submit button
  - Calls `supabase.auth.updateUser({ password })`
  - On success: `router.push('/dashboard')`
  - On error: show error inline

### Modified

- `src/app/auth/callback/route.ts`
  - Read `next` query param from the request URL
  - After successful code exchange, if `next` is present (and is a safe relative path), redirect there instead of the default onboarding/dashboard logic
  - Default behavior unchanged when `next` is absent

## UI Details

- "Forgot password?" — small muted link (`text-sm text-muted-foreground`) positioned below the password field in the sign-in tab, right-aligned
- Both new pages reuse the same outer layout (`min-h-screen flex items-center justify-center bg-background`) and Card component as the login page
- Loading and error states follow the same patterns already in login page (`disabled={loading}`, `text-destructive`)

## Security

- The `next` param in the callback is validated to be a relative path (starts with `/`) before redirecting, preventing open redirect attacks
