import type { Conviction, Status, ArcPublishStatus } from '@/types'

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short'
  })
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function convictionLabel(c: Conviction): string {
  return c.charAt(0).toUpperCase() + c.slice(1)
}

export function statusLabel(s: Status): string {
  if (s === 'in_position') return 'In Position'
  if (s === 'watching') return 'Watching'
  return 'Exited'
}

export function arcStatusLabel(s: ArcPublishStatus): string {
  if (s === 'published') return 'Published on Arc'
  if (s === 'pending') return 'Pending publication'
  return 'Publication failed'
}

export function truncateHash(hash: string, chars = 10): string {
  return `${hash.slice(0, chars)}…${hash.slice(-6)}`
}
