// src/lib/companies/discovery-email.ts
import { Resend } from 'resend'
import { escapeAttr, escapeHtml } from '@/lib/html-escape'
import type { NewCompany } from './registry'

const TO_EMAIL = 'heer.luca@gmail.com'

const SOURCE_LABELS: Record<string, string> = {
  apify_linkedin: 'LinkedIn',
  apify_career_site: 'Career site',
  jobich: 'Jobich',
}

export function buildDiscoveryEmail(
  companies: NewCompany[],
  dateLabel: string,
): { subject: string; html: string } {
  const n = companies.length
  const noun = n === 1 ? 'company' : 'companies'
  // dateLabel is always a YYYY-MM-DD string from Intl.DateTimeFormat, so it is
  // safe to interpolate unescaped.
  const subject = `Jobfish — ${n} new ${noun} discovered (${dateLabel})`

  const items = companies
    .map(c => {
      const label = SOURCE_LABELS[c.source] ?? c.source
      const name = escapeHtml(c.name)
      // sampleJobUrl comes from third-party scraped pages — only allow http(s)
      // so a hostile value can't smuggle in a javascript: href.
      const safeUrl =
        c.sampleJobUrl && /^https?:\/\//i.test(c.sampleJobUrl) ? c.sampleJobUrl : null
      const nameHtml = safeUrl
        ? `<a href="${escapeAttr(safeUrl)}">${name}</a>`
        : name
      return `<li>${nameHtml} <span style="color:#777;">— ${escapeHtml(label)}</span></li>`
    })
    .join('')

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px;">
      <h2 style="margin-bottom: 8px;">${n} new ${noun} discovered</h2>
      <p style="color:#555; margin-top:0;">${dateLabel} · found by the Apify fallback scrape and not yet in the database.</p>
      <ul style="line-height: 1.6;">${items}</ul>
    </div>
  `
  return { subject, html }
}

/** Sends the discovery email. No-op when there are no new companies. */
export async function sendDiscoveryEmail(
  companies: NewCompany[],
  dateLabel: string,
): Promise<void> {
  if (companies.length === 0) return
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY environment variable is not set')

  const resend = new Resend(apiKey)
  const { subject, html } = buildDiscoveryEmail(companies, dateLabel)
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'jobs@jobfish.ing',
    to: TO_EMAIL,
    subject,
    html,
  })
}
