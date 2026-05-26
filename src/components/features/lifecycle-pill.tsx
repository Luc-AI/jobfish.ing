import { Badge } from '@/components/ui/badge'

interface LifecyclePillProps {
  status: 'new' | 'saved' | 'applied' | 'dismissed'
  appliedAt?: string | null
}

export function LifecyclePill({ status }: LifecyclePillProps) {
  if (status === 'new' || status === 'dismissed') return null

  if (status === 'saved') {
    return <Badge variant="secondary">Saved</Badge>
  }

  return (
    <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1" />
      Applied
    </Badge>
  )
}
