import { z } from 'zod'

export const cvSummarySchema = z.object({
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
