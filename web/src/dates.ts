// Date-only values stay in UTC for both arithmetic and display.
export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

export function shiftDate(value: string, days: number): string {
  const date = parseDate(value)!
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function rangeError(from: string, to: string): string | null {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end) return 'Enter valid start and end dates.'
  if (end < start) return 'End date must be on or after start date.'
  const limit = new Date(start)
  limit.setUTCFullYear(limit.getUTCFullYear() + 2)
  if (end > limit) return 'Choose a range of at most two years.'
  return null
}

const dateFormat = new Intl.DateTimeFormat('en', {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
})
export function formatDate(value: string): string {
  return dateFormat.format(parseDate(value)!)
}
