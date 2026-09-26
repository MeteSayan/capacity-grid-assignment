import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { App } from './App'

// Opt in only against the local seeded Compose database. Restores original hours.
it.skipIf(!import.meta.env.VITE_LIVE_CAPACITY_TEST)('edits and restores Dee through the rendered form and live API', async () => {
  const realFetch = globalThis.fetch
  const url = 'http://api:8080/api/capacity?from=2025-12-29&to=2026-01-16'
  const initial = await (await realFetch(url)).json()
  const original = initial.people.find((p: { id: number }) => p.id === 4).weeklyHours
  vi.stubGlobal('fetch', (path: string, options?: RequestInit) => realFetch(`http://api:8080${path}`, options))
  try {
    render(<App />)
    for (const value of [32.5, 0, original]) {
      fireEvent.click(await screen.findByRole('button', { name: 'Edit capacity for Dee Okafor' }))
      fireEvent.change(screen.getByLabelText('Weekly hours'), { target: { value: String(value) } })
      fireEvent.click(screen.getByRole('button', { name: 'Save capacity' }))
      await screen.findByText('Capacity saved. The grid is up to date.')
      const row = screen.getByRole('row', { name: /Dee Okafor/ })
      expect(within(row).getByRole('cell', { name: new RegExp(`^45 / ${value} h`) })).toBeTruthy()
      const current = await (await realFetch(url)).json()
      expect(current.people.find((p: { id: number }) => p.id === 4).weeklyHours).toBe(value)
    }
  } finally {
    // Restore even if an assertion fails before the UI restoration completes.
    const restored = await realFetch('http://api:8080/api/people/4', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyHours: original }),
    })
    cleanup()
    vi.unstubAllGlobals()
    expect(restored.ok).toBe(true)
    const current = await (await realFetch(url)).json()
    expect(current.people.find((p: { id: number }) => p.id === 4).weeklyHours).toBe(original)
  }
}, 15000)
