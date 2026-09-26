import { useState, type FormEvent } from 'react'
import { CapacityGrid } from './CapacityGrid'
import { rangeError, shiftDate } from './dates'

// The range the grid loads. Widen it if you want to see more.
const FROM = '2025-12-29'
const TO = '2026-01-16'

export function App() {
  const [range, setRange] = useState({ from: FROM, to: TO })
  const [from, setFrom] = useState(FROM)
  const [to, setTo] = useState(TO)
  const [error, setError] = useState<string | null>(null)
  function apply(event: FormEvent) {
    event.preventDefault()
    const problem = rangeError(from, to)
    setError(problem)
    if (!problem) setRange({ from, to })
  }
  function navigate(days: number) {
    const next = { from: shiftDate(range.from, days), to: shiftDate(range.to, days) }
    const problem = rangeError(next.from, next.to)
    setError(problem)
    if (problem) return
    setRange(next)
    setFrom(next.from)
    setTo(next.to)
  }
  return (
    <main>
      <p className="eyebrow">Team overview</p>
      <h1>Team capacity</h1>
      <p className="intro">Compare allocated hours with weekly capacity.</p>
      <form className="range-controls" onSubmit={apply}>
        <label>From<input type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>To<input type="date" required value={to} onChange={e => setTo(e.target.value)} /></label>
        <button type="submit">Apply range</button>
        <div className="week-navigation" aria-label="Week navigation" role="group">
          <button type="button" onClick={() => navigate(-7)}>← Previous week</button>
          <button type="button" onClick={() => navigate(7)}>Next week →</button>
        </div>
      </form>
      <p className="hint">Selections include full Monday–Sunday weeks. Allocations count Monday–Friday. Maximum range: two years.</p>
      {error && <p role="alert" className="error">{error}</p>}
      {/* Remount so old rows and headers disappear together when the range changes. */}
      <CapacityGrid key={`${range.from}/${range.to}`} from={range.from} to={range.to} />
    </main>
  )
}
