import { z } from 'zod'

export const dimensionsSchema = z.object({
  role_fit: z.number().min(0).max(10),
  company_fit: z.number().min(0).max(10),
  location: z.number().min(0).max(10),
  growth_potential: z.number().min(0).max(10),
})

export const scoreResponseSchema = z.object({
  score: z.number().min(0).max(10),
  reasoning: z.string().min(1),
  dimensions: dimensionsSchema,
})

export type ScoreResponse = z.infer<typeof scoreResponseSchema>
