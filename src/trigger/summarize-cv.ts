import { task } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/service'
import { callOpenRouter } from './lib/evaluate'

const cvSummarySchema = z.object({
  name: z.string(),
  current_title: z.string(),
  seniority: z.enum(['junior', 'mid', 'senior', 'lead', 'principal', 'director', 'executive']),
  skills: z.array(z.string()),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    duration: z.string(),
  })),
  education: z.array(z.object({
    degree: z.string(),
    institution: z.string(),
    year: z.string(),
  })),
  key_achievements: z.array(z.string()),
})

export type CvSummary = z.infer<typeof cvSummarySchema>

function buildSummarizationPrompt(cvText: string): string {
  return `Extract key information from this CV and return structured JSON.

Return ONLY valid JSON with exactly these fields:
- name: full name (string)
- current_title: current or most recent job title (string)
- seniority: one of "junior", "mid", "senior", "lead", "principal", "director", "executive" (string)
- skills: up to 20 most relevant technical and domain skills, most important first (array of strings)
- experience: up to 5 most recent roles as objects with title, company, duration fields (array)
- education: degrees as objects with degree, institution, year fields (array)
- key_achievements: 3–5 notable highlights or measurable accomplishments (array of strings)

CV TEXT:
---
${cvText}
---`
}

export const summarizeCvTask = task({
  id: 'summarize-cv',
  retry: { maxAttempts: 3, minTimeoutInMs: 1000, factor: 2 },
  run: async ({ userId }: { userId: string }) => {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is not set')

    const supabase = createServiceClient()

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('cv_text')
      .eq('id', userId)
      .single()

    if (error) throw error

    if (!profile?.cv_text?.trim()) {
      console.log(`[summarize-cv] No cv_text for user ${userId}, skipping`)
      return { skipped: true }
    }

    const prompt = buildSummarizationPrompt(profile.cv_text)
    const raw = await callOpenRouter(prompt)

    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : raw.trim()

    const summary = cvSummarySchema.parse(JSON.parse(candidate))

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ cv_summary: summary })
      .eq('id', userId)

    if (updateError) throw updateError

    console.log(`[summarize-cv] Summary saved for user ${userId}`)
    return { success: true }
  },
})
