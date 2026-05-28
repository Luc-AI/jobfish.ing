// src/trigger/scrape-apify-fallback.ts
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import {
  APIFY_ACTORS,
  CAREER_SITE_PAYLOAD,
  LINKEDIN_PAYLOAD,
  normalizeItem,
  runActor,
  type ApifyFallbackRow,
  type ApifySource,
} from './lib/apify'

const TO_EMAIL = 'heer.luca@gmail.com'

export const scrapeApifyFallbackTask = schedules.task({
  id: 'scrape-apify-fallback',
  cron: { pattern: '0 6 * * *', timezone: 'Europe/Berlin' },
  retry: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000 },
  run: async () => {
    const fetchedAt = new Date().toISOString()
    const sources: ApifySource[] = ['linkedin', 'career_site']
    const payloads = { linkedin: LINKEDIN_PAYLOAD, career_site: CAREER_SITE_PAYLOAD }

    const settled = await Promise.allSettled(
      sources.map(s => runActor(APIFY_ACTORS[s], payloads[s])),
    )

    const rows: ApifyFallbackRow[] = []
    const errors: { source: ApifySource; message: string }[] = []

    settled.forEach((result, idx) => {
      const source = sources[idx]
      if (result.status === 'fulfilled') {
        for (const item of result.value) {
          rows.push(normalizeItem(source, item, fetchedAt))
        }
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
        errors.push({ source, message })
        Sentry.captureException(result.reason, {
          tags: { task: 'scrape-apify-fallback', source },
        })
      }
    })

    if (rows.length > 0) {
      const supabase = createServiceClient()
      const { error } = await supabase.from('apify_fallback_jobs').insert(rows)
      if (error) {
        Sentry.captureException(new Error(`apify_fallback_jobs insert failed: ${error.message}`))
      }
    }

    await sendSummaryEmail({ rows, errors, fetchedAt }).catch(err => {
      Sentry.captureException(err)
    })

    console.log(
      `scrape-apify-fallback: ${rows.length} jobs (linkedin: ${rows.filter(r => r.source === 'linkedin').length}, career_site: ${rows.filter(r => r.source === 'career_site').length}), errors: ${errors.length}`,
    )
    return { inserted: rows.length, errors: errors.length }
  },
})

interface SummaryArgs {
  rows: ApifyFallbackRow[]
  errors: { source: ApifySource; message: string }[]
  fetchedAt: string
}

async function sendSummaryEmail({ rows, errors, fetchedAt }: SummaryArgs) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY environment variable is not set')

  const resend = new Resend(apiKey)
  const dateLabel = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(fetchedAt))

  const subject = `Apify fallback — ${rows.length} jobs (${dateLabel})`

  const linkedinRows = rows.filter(r => r.source === 'linkedin')
  const careerRows = rows.filter(r => r.source === 'career_site')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px;">
      <h2 style="margin-bottom: 8px;">Apify fallback — ${dateLabel}</h2>
      <p style="color: #555; margin-top: 0;">${rows.length} jobs total · LinkedIn: ${linkedinRows.length} · Career sites: ${careerRows.length}</p>
      ${renderErrorBanner(errors)}
      ${renderSection('LinkedIn', linkedinRows)}
      ${renderSection('Career sites', careerRows)}
    </div>
  `

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
    to: TO_EMAIL,
    subject,
    html,
  })
}

function renderErrorBanner(errors: { source: ApifySource; message: string }[]): string {
  if (errors.length === 0) return ''
  const lines = errors
    .map(e => `<li><strong>${e.source}</strong>: ${escapeHtml(e.message)}</li>`)
    .join('')
  return `
    <div style="background:#fff4f4; border:1px solid #f5c2c2; padding:12px; border-radius:6px; margin: 12px 0;">
      <strong style="color:#a40000;">Actor failures</strong>
      <ul style="margin: 6px 0 0 18px;">${lines}</ul>
    </div>
  `
}

function renderSection(title: string, rows: ApifyFallbackRow[]): string {
  if (rows.length === 0) {
    return `<h3 style="margin-top: 20px;">${title}</h3><p style="color:#777;">(no jobs returned)</p>`
  }
  const items = rows
    .map(r => {
      const t = r.title ?? '(no title)'
      const titleHtml = r.url
        ? `<a href="${escapeAttr(r.url)}">${escapeHtml(t)}</a>`
        : escapeHtml(t)
      const company = escapeHtml(r.company ?? '(no company)')
      const loc = escapeHtml(r.location ?? '(no location)')
      return `<li>${titleHtml} — ${company} — ${loc}</li>`
    })
    .join('')
  return `<h3 style="margin-top: 20px;">${title}</h3><ul style="line-height: 1.6;">${items}</ul>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
