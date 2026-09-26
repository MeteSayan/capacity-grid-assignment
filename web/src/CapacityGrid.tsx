import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatDate } from './dates'

type Props = {
  from: string
  to: string
  onBusyChange: (busy: boolean) => void
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

export function CapacityGrid({ from, to, onBusyChange }: Props) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)
  const [editor, setEditor] = useState<{ id: number; name: string; draft: string; error: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const submitting = useRef(false)
  const mounted = useRef(false)
  const editButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor || submitting.current) return
    const weeklyHours = Number(editor.draft)
    if (editor.draft.trim() === '' || !Number.isFinite(weeklyHours) || weeklyHours < 0) {
      setEditor({ ...editor, error: 'Enter a non-negative number of hours.' })
      return
    }
    submitting.current = true
    setSaving(true)
    setSaved(false)
    setEditor({ ...editor, error: null })
    onBusyChange(true)
    try {
      const response = await fetch(`/api/people/${editor.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeklyHours }),
      })
      if (!response.ok) throw new Error('Save failed')
      if (!mounted.current) return
      setSaved(true)
      setEditor(null)
      // Hide the old capacity immediately; only the fresh GET supplies new numbers.
      setState({ status: 'loading' })
      setAttempt(value => value + 1)
    } catch {
      if (!mounted.current) return
      setEditor({ ...editor, error: 'Save failed. Your draft is kept; try saving again.' })
      onBusyChange(false)
    } finally {
      submitting.current = false
      if (mounted.current) setSaving(false)
    }
  }

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
      } finally {
        if (active) onBusyChange(false)
      }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [from, to, attempt, onBusyChange])
  if (state.status === 'loading') return <section className="status-panel" role="status">{saved && 'Capacity saved. Refreshing the grid. '}Loading capacity for {formatDate(from)} – {formatDate(to)}…</section>
  if (state.status === 'error') return (
    <section className="status-panel">
      <p role="alert" className="error">{saved ? 'Capacity saved, but the grid could not refresh. Retry the refresh to see the saved capacity.' : 'Could not load capacity. Check your connection and try again.'}</p>
      <button onClick={() => { if (saved) onBusyChange(true); setAttempt(value => value + 1) }}>{saved ? 'Retry refresh' : 'Retry'}</button>
    </section>
  )
  const { data } = state
  const pageCount = Math.ceil(data.people.length / PAGE_SIZE)
  const people = data.people.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return (
    <section aria-label="Weekly capacity">
      {saved && <p role="status">Capacity saved. The grid is up to date.</p>}
      {editor && <form className="capacity-editor" onSubmit={save} aria-label={`Edit capacity for ${editor.name}`}>
        <h2>Weekly capacity · <bdi>{editor.name}</bdi></h2>
        <p id="capacity-help">This recurring capacity applies to every week, including past weeks.</p>
        <label>Weekly hours
          <input autoFocus type="number" min="0" step="any" required value={editor.draft}
            readOnly={saving} aria-describedby="capacity-help" aria-invalid={!!editor.error}
            onChange={event => setEditor({ ...editor, draft: event.target.value, error: null })} />
        </label>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save capacity'}</button>
        <button type="button" disabled={saving} onClick={() => { setEditor(null); editButton.current?.focus() }}>Cancel</button>
        {saving && <p role="status">Saving capacity. Your entered value is kept while saving.</p>}
        {editor.error && <p role="alert" className="error">{editor.error}</p>}
      </form>}
      <div className="grid-summary">
        <h2>{formatDate(data.effectiveFrom)} – {formatDate(data.effectiveTo)}</h2>
        <span className="legend">Allocated / capacity · hours <span className="over-label">▲ Over capacity</span></span>
      </div>
      {people.length === 0 ? <p role="status">No people to display.</p> : <>
        <div className="pagination">
          <p role="status">People {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.people.length)} of {data.people.length} · {data.weeks.length} weeks</p>
          <div role="group" aria-label="People pages">
            <button disabled={page === 0 || editor !== null} onClick={() => setPage(page - 1)}>Previous people</button>
            <span>Page {page + 1} of {pageCount}</span>
            <button disabled={page + 1 >= pageCount || editor !== null} onClick={() => setPage(page + 1)}>Next people</button>
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
              <th scope="row" aria-label={person.name}><bdi>{person.name}</bdi>
                <button className="edit-capacity" disabled={editor !== null} aria-label={`Edit capacity for ${person.name}`}
                  onClick={event => {
                    editButton.current = event.currentTarget
                    setSaved(false)
                    setEditor({ id: person.id, name: person.name, draft: String(person.weeklyHours), error: null })
                  }}>Edit capacity</button>
              </th>
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
