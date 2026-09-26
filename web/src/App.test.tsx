import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { App } from './App'
import { formatDate, parseDate, rangeError, shiftDate } from './dates'

const seed = {
  effectiveFrom: '2025-12-29', effectiveTo: '2026-01-18',
  weeks: ['2025-12-29', '2026-01-05', '2026-01-12'],
  people: [
    { id: 4, name: 'Dee Okafor', weeklyHours: 40, allocatedHours: [0, 45, 40] },
    { id: 5, name: 'Eli Nakamura', weeklyHours: 0, allocatedHours: [0, 20, 0] },
  ],
}
const response = (data = seed) => ({ ok: true, json: async () => data }) as Response

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows loading, accessible over-capacity labels, and recovers from a failed request', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(response())
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  expect(screen.getByRole('status').textContent).toContain('Loading capacity')
  expect((await screen.findByRole('alert')).textContent).toContain('Could not load capacity')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  const dee = await screen.findByRole('row', { name: /Dee Okafor/ })
  const eli = screen.getByRole('row', { name: /Eli Nakamura/ })
  expect(within(dee).getByRole('cell', { name: /45 \/ 40 h.*Over capacity/ }).className).toBe('over-capacity')
  expect(within(eli).getByRole('cell', { name: /20 \/ 0 h.*Over capacity/ }).className).toBe('over-capacity')
  expect(within(dee).getByRole('cell', { name: '40 / 40 h' }).className).toBe('')
})

it('removes old headers during navigation and ignores responses arriving out of order', async () => {
  const pending: ((value: Response) => void)[] = []
  const fetch = vi.fn(() => new Promise<Response>(resolve => pending.push(resolve)))
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  await act(async () => { pending[0](response()) })
  expect(screen.getByRole('columnheader', { name: /Dec 29, 2025/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Next week/ }))
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Loading capacity')
  fireEvent.click(screen.getByRole('button', { name: /Previous week/ }))
  await act(async () => { pending[2](response()) })
  await act(async () => { pending[1](response({ ...seed, weeks: ['2026-01-05', '2026-01-12', '2026-01-19'] })) })
  expect(screen.getByRole('columnheader', { name: /Dec 29, 2025/ })).toBeTruthy()
  expect(screen.queryByRole('columnheader', { name: /Jan 19, 2026/ })).toBeNull()
  expect(fetch.mock.calls.length).toBe(3)
})

it('applies date inputs only on submit, rejects reversed ranges, and paginates people', async () => {
  const people = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}`, weeklyHours: 40, allocatedHours: [0, 0, 0] }))
  const fetch = vi.fn().mockResolvedValue(response({ ...seed, people }))
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  await screen.findByRole('rowheader', { name: 'Person 1' })
  expect(screen.getAllByRole('rowheader')).toHaveLength(25)
  fireEvent.click(screen.getByRole('button', { name: 'Next people' }))
  expect(screen.getByRole('rowheader', { name: 'Person 26' })).toBeTruthy()
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-02-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
  expect(screen.getByRole('alert').textContent).toContain('End date must be')
  expect(fetch).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-02-15' } })
  fireEvent.click(screen.getByRole('button', { name: 'Apply range' }))
  await screen.findByRole('rowheader', { name: 'Person 1' })
  expect(fetch).toHaveBeenLastCalledWith('/api/capacity?from=2026-02-01&to=2026-02-15', expect.anything())
})

it('keeps calendar dates stable across year, leap-day, and DST boundaries', () => {
  expect(shiftDate('2025-12-29', 7)).toBe('2026-01-05')
  expect(shiftDate('2026-03-06', 7)).toBe('2026-03-13')
  expect(shiftDate('2024-02-26', 7)).toBe('2024-03-04')
  expect(formatDate('2026-01-05')).toBe('Jan 5, 2026')
  expect(parseDate('2026-02-30')).toBeNull()
  expect(rangeError('2025-01-01', '2027-01-01')).toBeNull()
  expect(rangeError('2025-01-01', '2027-01-02')).toContain('two years')
})

it('keeps the saving draft, prevents duplicate PATCHes, and refetches every week after saving', async () => {
  let finishSave!: (value: Response) => void
  const updated = { ...seed, people: seed.people.map(p => p.id === 4 ? { ...p, weeklyHours: 32.5 } : p) }
  const fetch = vi.fn().mockResolvedValueOnce(response())
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishSave = resolve }))
    .mockResolvedValueOnce(response(updated))
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit capacity for Dee Okafor' }))
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '32.5' } })
  const form = screen.getByRole('form', { name: 'Edit capacity for Dee Okafor' })
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect((screen.getByLabelText('Weekly hours') as HTMLInputElement).value).toBe('32.5')
  expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('group', { name: 'Date range' }) as HTMLFieldSetElement).disabled).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch).toHaveBeenLastCalledWith('/api/people/4', expect.objectContaining({ method: 'PATCH', body: '{"weeklyHours":32.5}' }))
  await act(async () => { finishSave({ ok: true } as Response) })
  const row = await screen.findByRole('row', { name: /Dee Okafor/ })
  expect(within(row).getByRole('cell', { name: /45 \/ 32.5/ })).toBeTruthy()
  expect(within(row).getByRole('cell', { name: /40 \/ 32.5/ })).toBeTruthy()
  expect(within(row).getByRole('cell', { name: /^0 \/ 32.5/ })).toBeTruthy()
  expect(fetch).toHaveBeenLastCalledWith('/api/capacity?from=2025-12-29&to=2026-01-16', expect.anything())
})

it('preserves a zero-hour draft after PATCH failure and permits retry', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(response({ ...seed, people: seed.people.map(p => ({ ...p, weeklyHours: 0 })) }))
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit capacity for Dee Okafor' }))
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Save failed')
  expect((screen.getByLabelText('Weekly hours') as HTMLInputElement).value).toBe('0')
  expect(screen.getByRole('cell', { name: /45 \/ 40/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
  expect(await screen.findByRole('cell', { name: /45 \/ 0/ })).toBeTruthy()
})

it('distinguishes a saved capacity with failed refresh and retries GET without resaving', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce(response())
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Edit capacity for Dee Okafor' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Capacity saved, but the grid could not refresh')
  expect(screen.queryByRole('table')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }))
  await screen.findByRole('table')
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1)
})

it('ignores an older GET arriving after a successful save and refreshed grid', async () => {
  let finishOld!: (value: Response) => void
  const updated = { ...seed, people: seed.people.map(p => p.id === 4 ? { ...p, weeklyHours: 50 } : p) }
  const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve }))
    .mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(response(updated))
  vi.stubGlobal('fetch', fetch)
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Next week/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Edit capacity for Dee Okafor' }))
  fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: '50' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
  await screen.findByRole('cell', { name: '45 / 50 h' })
  await act(async () => { finishOld(response()) })
  expect(screen.getByRole('cell', { name: '45 / 50 h' })).toBeTruthy()
  expect(screen.queryByRole('cell', { name: /45 \/ 40/ })).toBeNull()
  expect(fetch).toHaveBeenLastCalledWith('/api/capacity?from=2026-01-05&to=2026-01-23', expect.anything())
})
