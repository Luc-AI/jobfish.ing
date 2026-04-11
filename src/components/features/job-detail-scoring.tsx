import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScoreBadge } from './score-badge'
import type { JobDetailData } from '@/lib/supabase/queries'

type Evaluation = NonNullable<JobDetailData['evaluation']>

const DIMENSION_LABELS: Record<string, string> = {
  role_fit: 'Role Fit',
  domain_fit: 'Domain Fit',
  experience_fit: 'Experience Fit',
  location_fit: 'Location Fit',
  upside: 'Upside',
}

interface JobDetailScoringProps {
  evaluation: Evaluation
}

export function JobDetailScoring({ evaluation }: JobDetailScoringProps) {
  const { score, reasoning, dimensions, detailed_reasoning } = evaluation

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">AI Scoring</h2>
        <ScoreBadge score={score} />
      </div>

      {dimensions && detailed_reasoning && (
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(dimensions).map(([key, val]) => (
            <Card key={key}>
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">
                  {DIMENSION_LABELS[key] ?? key}
                </p>
                <p className="text-sm font-bold tabular-nums">{(val as number).toFixed(1)}</p>
                {detailed_reasoning.dimension_explanations?.[key as keyof typeof detailed_reasoning.dimension_explanations] && (
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">
                    {detailed_reasoning.dimension_explanations[key as keyof typeof detailed_reasoning.dimension_explanations]}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dimensions && !detailed_reasoning && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Best dimension score</span>
            <ScoreBadge score={Math.max(...(Object.values(dimensions) as number[]))} />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {Object.entries(dimensions).map(([key, val]) => (
              <Card key={key}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">
                    {DIMENSION_LABELS[key] ?? key}
                  </p>
                  <p className="text-sm font-bold tabular-nums">{Math.round(val as number)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {detailed_reasoning ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground italic">{detailed_reasoning.summary}</p>

          <Separator />

          {detailed_reasoning.strengths.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Strengths</p>
              <ul className="space-y-1">
                {detailed_reasoning.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-green-600">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detailed_reasoning.concerns.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Concerns</p>
              <ul className="space-y-1">
                {detailed_reasoning.concerns.map((c, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-yellow-600">~</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detailed_reasoning.red_flags.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1 text-red-600">Red Flags</p>
              <ul className="space-y-1">
                {detailed_reasoning.red_flags.map((f, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-red-600">!</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-1">Recommendation</p>
            <p className="text-sm text-muted-foreground">{detailed_reasoning.recommendation}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {reasoning && (
            <p className="text-sm text-muted-foreground italic">{reasoning}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Detailed AI scoring is not available yet for this job.
          </p>
        </div>
      )}
    </div>
  )
}
