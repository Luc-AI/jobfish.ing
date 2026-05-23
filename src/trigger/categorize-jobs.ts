// src/trigger/categorize-jobs.ts
import { task } from '@trigger.dev/sdk'
import * as Sentry from '@sentry/node'
import { createServiceClient } from '@/lib/supabase/service'
import { callOpenRouter } from './lib/evaluate'

const TAXONOMY = [
  'Engineering', 'AI & Data', 'Cybersecurity', 'Product', 'Design & UX',
  'Sales', 'Business', 'Marketing', 'Finance', 'Quantitative Finance',
  'Customer Success', 'People & HR', 'Legal & Compliance',
  'Strategy & Operations', 'Consulting', 'Hardware & Embedded', 'Other',
] as const

type TaxonomyCategory = typeof TAXONOMY[number]

const SYSTEM_PROMPT = `You are a job categorization assistant. Your goal is high recall — it is always worse to miss a relevant category than to assign an extra one.

Rules:
- Always assign at least one category
- Assign at most 3 categories
- If a job could plausibly belong to multiple categories, include all relevant ones up to the limit
- Only use categories from the approved taxonomy — never invent new ones
- Respond ONLY with a JSON array: [{ "job_id": "...", "categories": ["..."] }, ...]

Approved taxonomy:
Engineering, AI & Data, Cybersecurity, Product, Design & UX, Sales, Business, Marketing, Finance, Quantitative Finance, Customer Success, People & HR, Legal & Compliance, Strategy & Operations, Consulting, Hardware & Embedded, Other

Examples:
- "Senior Full Stack Engineer" → ["Engineering"]
- "Head of Product" → ["Product"]
- "VP of Engineering" → ["Engineering"]
- "ML Platform Engineer" → ["Engineering", "AI & Data"]
- "Platform Security Engineer" → ["Engineering", "Cybersecurity"]
- "Quant Researcher" → ["Quantitative Finance"]
- "Growth Marketing Manager" → ["Marketing"]
- "Chief of Staff" → ["Strategy & Operations", "Business"]`

type JobRow = { id: string; title: string; industry: string | null; description: string | null }
type BatchResult = Array<{ job_id: string; categories: string[] }>

export function parseBatchResponse(raw: string): BatchResult {
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`No JSON array found in LLM response: ${raw.slice(0, 200)}`)
  const parsed = JSON.parse(match[0]) as unknown
  if (!Array.isArray(parsed)) throw new Error('LLM response is not a JSON array')
  return parsed as BatchResult
}

export function validateCategories(cats: string[]): TaxonomyCategory[] {
  const valid = cats
    .filter((c): c is TaxonomyCategory => TAXONOMY.includes(c as TaxonomyCategory))
    .slice(0, 3)
  return valid.length > 0 ? valid : ['Other']
}

function buildBatchPrompt(jobs: JobRow[]): string {
  const lines = jobs.map(j =>
    `Job ID: ${j.id} | Title: ${j.title} | Industry: ${j.industry ?? 'Unknown'} | Description: ${(j.description ?? '').slice(0, 300)}`
  ).join('\n')
  return `${SYSTEM_PROMPT}\n\nCategorize the following jobs:\n${lines}`
}

async function categorizeSingle(job: JobRow): Promise<{ job_id: string; categories: TaxonomyCategory[] }> {
  const raw = await callOpenRouter(buildBatchPrompt([job]))
  const results = parseBatchResponse(raw)
  const match = results.find(r => r.job_id === job.id)
  return { job_id: job.id, categories: validateCategories(match?.categories ?? []) }
}

export const categorizeJobsTask = task({
  id: 'categorize-jobs',
  retry: { maxAttempts: 3 },
  run: async (payload: { jobIds: string[] }) => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

    const supabase = createServiceClient()

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, title, industry, description')
      .in('id', payload.jobIds)

    if (error) throw error
    if (!jobs?.length) return { categorized: 0 }

    const BATCH_SIZE = 10
    let categorized = 0

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE)

      let results: Array<{ job_id: string; categories: TaxonomyCategory[] }>

      try {
        const raw = await callOpenRouter(buildBatchPrompt(batch))
        const parsed = parseBatchResponse(raw)
        results = parsed.map(r => ({ job_id: r.job_id, categories: validateCategories(r.categories) }))
      } catch (batchErr) {
        console.warn(`Batch categorization failed (jobs ${i}–${i + batch.length - 1}), falling back to per-job:`, batchErr)
        results = []
        for (const job of batch) {
          try {
            results.push(await categorizeSingle(job))
          } catch (jobErr) {
            console.error(`Per-job categorization failed for ${job.id}:`, jobErr)
            Sentry.captureException(jobErr, {
              level: 'warning',
              extra: { jobId: job.id, title: job.title, industry: job.industry },
            })
            results.push({ job_id: job.id, categories: ['Other'] })
          }
        }
      }

      for (const { job_id, categories } of results) {
        if (categories.length === 1 && categories[0] === 'Other') {
          const job = batch.find(j => j.id === job_id)
          Sentry.captureMessage('Job categorized as Other', {
            level: 'warning',
            extra: { jobId: job_id, title: job?.title, industry: job?.industry },
          })
        }

        await supabase.from('jobs').update({ categories }).eq('id', job_id)
        categorized++
      }
    }

    console.log(`categorize-jobs: ${categorized} jobs categorized`)
    return { categorized }
  },
})
