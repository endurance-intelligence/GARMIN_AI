import { test } from 'node:test'
import assert from 'node:assert/strict'
import { terrainWindows } from '../supabase/functions/_shared/activity-terrain.mjs'

const slope = (grade, n = 1001) => Array.from({ length: n }, (_, i) => ({
  distance: i, elevation: 200 + i * grade / 100,
  hr: 120 + i / 35, speed: 3.1 - i / 1500,
}))

test('12% climb uses distance/elevation, not speed or HR as cause', () => {
  const result = terrainWindows(slope(12))
  assert.equal(result.quality, 'usable')
  assert.equal(result.windows.length, 10)
  for (const w of result.windows) {
    assert.ok(Math.abs(w.gradePct - 12) <= 0.2)
    assert.equal(w.terrain, 'uphill')
  }
})

test('descent is identified independently from heart rate', () => {
  const result = terrainWindows(slope(-7))
  assert.ok(result.windows.every(w => w.terrain === 'downhill' && Math.abs(w.gradePct + 7) <= 0.2))
})

test('isolated elevation spike is not mistaken for steep climb', () => {
  const points = slope(0)
  points[520].elevation = 900
  const result = terrainWindows(points)
  assert.equal(result.quality, 'usable')
  assert.ok(result.windows.every(w => w.terrain === 'level'))
})

test('no altitude is explicitly unavailable', () => {
  const result = terrainWindows(slope(12).map(({ distance }) => ({ distance })))
  assert.equal(result.quality, 'insufficient-elevation')
  assert.equal(result.windows.length, 0)
})

test('large measurement gaps are not interpolated into fake terrain', () => {
  const points = slope(12).filter(p => p.distance < 200 || p.distance > 800)
  const result = terrainWindows(points)
  assert.ok(result.windows.length < 5)
  assert.equal(result.quality, 'partial')
})
