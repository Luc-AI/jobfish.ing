import { z } from 'zod'

export const dimensionsSchema = z.object({
  role_fit: z.number().min(0).max(10),
  domain_fit: z.number().min(0).max(10),
  experience_fit: z.number().min(0).max(10),
  location_fit: z.number().min(0).max(10),
  upside: z.number().min(0).max(10),
})

export const detailedReasoningSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  red_flags: z.array(z.string()),
  recommendation: z.string().min(1),
  dimension_explanations: z.object({
    role_fit: z.string(),
    domain_fit: z.string(),
    experience_fit: z.string(),
    location_fit: z.string(),
    upside: z.string(),
  }),
})

export const scoreResponseSchema = z.object({
  score: z.number().min(0).max(10),
  reasoning: z.string().min(1),
  dimensions: dimensionsSchema,
  detailed_reasoning: detailedReasoningSchema,
})

export type ScoreResponse = z.infer<typeof scoreResponseSchema>
export type Dimensions = z.infer<typeof dimensionsSchema>
export type DetailedReasoning = z.infer<typeof detailedReasoningSchema>
