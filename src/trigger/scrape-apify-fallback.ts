// src/trigger/scrape-apify-fallback.ts
import { schedules } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/service'
import {
  APIFY_ACTORS,
  APIFY_TOKEN_ENV,
  CAREER_SITE_PAYLOAD,
  JOBS_CH_PAYLOAD,
  LINKEDIN_PAYLOAD,
  normalizeItem,
  runActor,
  type ApifyFallbackRow,
  type ApifySource,
} from './lib/apify'
import { registerCompanies, type CompanyObservation } from '@/lib/companies/registry'
import { sendDiscoveryEmail } from '@/lib/companies/discovery-email'
import { escapeAttr, escapeHtml } from '@/lib/html-escape'

const TO_EMAIL = ['heer.luca@gmail.com', 'nina.r.heer@gmail.com']

// Canonical source order + display labels, used for fetching, the summary
// email, and the run log so a new source is wired in exactly one place.
const SOURCES: ApifySource[] = ['linkedin', 'career_site', 'jobs_ch']
const SOURCE_LABELS: Record<ApifySource, string> = {
  linkedin: 'LinkedIn',
  career_site: 'Career sites',
  jobs_ch: 'jobs.ch',
}
const PAYLOADS: Record<ApifySource, Record<string, unknown>> = {
  linkedin: LINKEDIN_PAYLOAD,
  career_site: CAREER_SITE_PAYLOAD,
  jobs_ch: JOBS_CH_PAYLOAD,
}

export const scrapeApifyFallbackTask = schedules.task({
  id: 'scrape-apify-fallback',
  cron: { pattern: '0 6 * * *', timezone: 'Europe/Berlin' },
  retry: { maxAttempts: 2, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000 },
  run: async () => {
    const fetchedAt = new Date().toISOString()
    const sources = SOURCES

    const settled = await Promise.allSettled(
      sources.map(s => runActor(APIFY_ACTORS[s], PAYLOADS[s], APIFY_TOKEN_ENV[s])),
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
        console.error(`scrape-apify-fallback: ${source} actor failed: ${message}`)
        Sentry.captureException(result.reason, {
          tags: { task: 'scrape-apify-fallback', source },
        })
      }
    })

    if (rows.length > 0) {
      const supabase = createServiceClient()
      const { error } = await supabase.from('apify_fallback_jobs').insert(rows)
      if (error) {
        console.error(`scrape-apify-fallback: insert failed: ${error.message}`)
        Sentry.captureException(new Error(`apify_fallback_jobs insert failed: ${error.message}`))
      }
    }

    try {
      const supabase = createServiceClient()
      const observations: CompanyObservation[] = rows
        .filter(r => r.company)
        .map(r => ({
          name: r.company as string,
          source: `apify_${r.source}` as CompanyObservation['source'],
          sampleJobUrl: r.url,
        }))
      const newCompanies = await registerCompanies(supabase, observations)
      if (newCompanies.length > 0) {
        await sendDiscoveryEmail(newCompanies, formatBerlinDate(fetchedAt))
      }
      console.log(`scrape-apify-fallback: ${newCompanies.length} new companies discovered`)
    } catch (err) {
      console.error(
        `scrape-apify-fallback: company discovery failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      Sentry.captureException(err)
    }

    await sendSummaryEmail({ rows, errors, fetchedAt }).catch(err => {
      console.error(`scrape-apify-fallback: summary email failed: ${err instanceof Error ? err.message : String(err)}`)
      Sentry.captureException(err)
    })

    const perSource = SOURCES.map(s => `${s}: ${rows.filter(r => r.source === s).length}`).join(', ')
    console.log(
      `scrape-apify-fallback: ${rows.length} jobs (${perSource}), errors: ${errors.length}`,
    )
    // Trigger.dev may checkpoint/exit before @sentry/node's background flush completes.
    await Sentry.flush(2000)
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
  const dateLabel = formatBerlinDate(fetchedAt)

  const subject = `Apify fallback — ${rows.length} jobs (${dateLabel})`

  const rowsBySource = SOURCES.map(s => ({
    label: SOURCE_LABELS[s],
    rows: rows.filter(r => r.source === s),
  }))
  const counts = rowsBySource.map(({ label, rows }) => `${label}: ${rows.length}`).join(' · ')
  const sections = rowsBySource.map(({ label, rows }) => renderSection(label, rows)).join('')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px;">
      <h2 style="margin-bottom: 8px;">Apify fallback — ${dateLabel}</h2>
      <p style="color: #555; margin-top: 0;">${rows.length} jobs total · ${counts}</p>
      ${renderErrorBanner(errors)}
      ${sections}
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

// en-CA happens to format dates as YYYY-MM-DD.
function formatBerlinDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}
