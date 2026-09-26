import { useEffect, useState } from 'react'
import { formatDate } from './dates'

type Props = {
  from: string
  to: string
}

type Capacity = {
  effectiveFrom: string
  effectiveTo: string
  weeks: string[]
  people: { id: number; name: string; weeklyHours: number; allocatedHours: number[] }[]
}
type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: Capacity }
const PAGE_SIZE = 25
const hours = new Intl.NumberFormat('en', { maximumFractionDigits: 3 })

export function CapacityGrid({ from, to }: Props) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState({ status: 'loading' })
    async function load() {
      try {
        const response = await fetch(`/api/capacity?${new URLSearchParams({ from, to })}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Could not load capacity')
        const data: Capacity = await response.json()
        if (active) setState({ status: 'ready', data })
      } catch {
        if (active) setState({ status: 'error' })
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [from, to, attempt])
  if (state.status === 'loading') return <section className="status-panel" role="status">Loading capacity for {formatDate(from)} – {formatDate(to)}…</section>
  if (state.status === 'error') return (
    <section className="status-panel">
      <p role="alert" className="error">Could not load capacity. Check your connection and try again.</p>
      <button onClick={() => setAttempt(value => value + 1)}>Retry</button>
    </section>
  )
  const { data } = state
  const pageCount = Math.ceil(data.people.length / PAGE_SIZE)
  const people = data.people.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return (
    <section aria-label="Weekly capacity">
      <div className="grid-summary">
        <h2>{formatDate(data.effectiveFrom)} – {formatDate(data.effectiveTo)}</h2>
        <span className="legend">Allocated / capacity · hours <span className="over-label">▲ Over capacity</span></span>
      </div>
      {people.length === 0 ? <p role="status">No people to display.</p> : <>
        <div className="pagination">
          <p role="status">People {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.people.length)} of {data.people.length} · {data.weeks.length} weeks</p>
          <div role="group" aria-label="People pages">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous people</button>
            <span>Page {page + 1} of {pageCount}</span>
            <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next people</button>
          </div>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Capacity table; scroll to see more weeks and people">
          <table>
            <caption className="sr-only">Weekly allocated hours / capacity in hours. Weeks start on Monday. Over-capacity cells include a warning label.</caption>
            <thead><tr>
              <th scope="col">Person</th>
              {data.weeks.map(week => <th scope="col" key={week}><span className="week-prefix">Week of</span>{formatDate(week)}</th>)}
            </tr></thead>
            <tbody>{people.map(person => <tr key={person.id}>
              <th scope="row"><bdi>{person.name}</bdi></th>
              {data.weeks.map((week, index) => {
                const allocated = person.allocatedHours[index]
                const over = allocated > person.weeklyHours
                return <td key={week} className={over ? 'over-capacity' : undefined}>
                  <span className="cell-hours">{hours.format(allocated)} / {hours.format(person.weeklyHours)} <span className="unit">h</span></span>
                  {over && <span className="over-label">▲ Over capacity</span>}
                </td>
              })}
            </tr>)}</tbody>
          </table>
        </div>
      </>}
    </section>
  )
}
