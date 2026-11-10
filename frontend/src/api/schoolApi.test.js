import { afterEach, describe, expect, it, vi } from 'vitest'
import { schoolApi } from './schoolApi'

describe('schoolApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps class data returned by the backend', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: 'class-1',
        name: 'Grade 6 - Morning Shift',
        totalSeats: 10,
        heldSeats: 2,
        confirmedSeats: 3,
        availableSeats: 5,
      },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(schoolApi.getClasses()).resolves.toEqual([
      expect.objectContaining({ grade: 'Grade 6', shift: 'Morning', availableSeats: 5 }),
    ])
  })

  it('sends the student identity header when requesting a seat hold', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      holdId: 'hold-1',
      classId: 'class-1',
      status: 'HELD',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(schoolApi.applyForClass('12345678901234567', 'class-1'))
      .resolves.toEqual(expect.objectContaining({ id: 'hold-1', status: 'HELD' }))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/classes/class-1/holds',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Student-Id': '12345678901234567' }),
      }),
    )
  })

  it('rejects invalid student IDs before sending the request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(schoolApi.applyForClass('invalid', 'class-1'))
      .rejects.toThrow('সঠিক ১৭ অঙ্কের জন্ম নিবন্ধন নম্বর লিখুন।')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
