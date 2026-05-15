export type Conviction = 'low' | 'medium' | 'high'
export type Status = 'watching' | 'in_position' | 'exited'
export type ArcPublishStatus = 'pending' | 'published' | 'failed'

export interface ReasoningStep {
  step: number
  role: 'researcher' | 'risk_manager' | 'portfolio_manager'
  content: string
  timestamp: string
}

export interface Evidence {
  label: string
  source: string
  detail: string
  weight: 'supporting' | 'neutral' | 'contradicting'
}

export interface StatusEvent {
  status: Status
  timestamp: string
  note: string
}

export interface Trace {
  id: string
  asset: string
  market: string
  edge: string
  conviction: Conviction
  status: Status
  thesis: string
  conclusion: string
  edgeNarrative: string
  reasoningSteps: ReasoningStep[]
  evidence: Evidence[]
  risks: string[]
  catalysts: string[]
  positionIntent: string
  invalidationCriteria: string[]
  statusTimeline: StatusEvent[]
  arcPublishStatus: ArcPublishStatus
  traceHash: string
  arcTxHash: string | null
  publishedAt: string | null
  updatedAt: string
  createdAt: string
}
