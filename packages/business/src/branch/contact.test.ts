/************************************************************
 * Module Name  : branch/contact.test
 * Scope        : Unit test — a branch's public details (multi-branch R7.2)
 ************************************************************/

import { DEFAULT_BUSINESS_HOURS } from '@rgss/types'
import { describe, expect, it } from 'vitest'
import {
  branchAddressLines,
  formatCalendarDateIN,
  formatTime12h,
  telHref,
  weeklyHoursRows,
} from './contact'

describe('branchAddressLines', () => {
  it('prints the street lines, then city, state and pincode', () => {
    expect(
      branchAddressLines({
        addressLine1: '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd',
        addressLine2: 'Above SBI Bank ',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560100',
      }),
    ).toEqual([
      '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd',
      'Above SBI Bank',
      'Bengaluru, Karnataka 560100',
    ])
  })

  it('leaves out what is not known', () => {
    expect(branchAddressLines({ addressLine1: 'MG Road', pincode: '560001' })).toEqual([
      'MG Road',
      '560001',
    ])
    expect(
      branchAddressLines({ addressLine1: 'MG Road', addressLine2: '', city: 'Mysuru' }),
    ).toEqual(['MG Road', 'Mysuru'])
  })
})

describe('telHref', () => {
  it.each([
    ['+91 63601 35720', 'tel:+916360135720'],
    ['6360135720', 'tel:+916360135720'],
    ['916360135720', 'tel:+916360135720'],
    ['06360135720', 'tel:+916360135720'],
  ])('links %s', (phone, href) => {
    expect(telHref(phone)).toBe(href)
  })

  it.each([null, '', '0000000000', '12345', 'call us'])('has no link for %s', (phone) => {
    expect(telHref(phone)).toBeNull()
  })
})

describe('formatTime12h', () => {
  it.each([
    ['00:30', '12:30 AM'],
    ['09:05', '9:05 AM'],
    ['12:00', '12:00 PM'],
    ['21:00', '9:00 PM'],
    ['23:59', '11:59 PM'],
  ])('%s reads %s', (time, text) => {
    expect(formatTime12h(time)).toBe(text)
  })

  it('returns anything else as given', () => {
    expect(formatTime12h('later')).toBe('later')
    expect(formatTime12h('25:00')).toBe('25:00')
  })
})

describe('weeklyHoursRows', () => {
  it('groups the default week into weekdays and the weekend', () => {
    expect(weeklyHoursRows(DEFAULT_BUSINESS_HOURS)).toEqual([
      { days: 'Mon – Fri', hours: '10:00 AM – 9:00 PM' },
      { days: 'Sat – Sun', hours: '10:00 AM – 10:00 PM' },
    ])
  })

  it('says Closed and keeps a lone day on its own row', () => {
    expect(
      weeklyHoursRows({
        ...DEFAULT_BUSINESS_HOURS,
        tue: { open: null, close: null, closed: true },
        sun: { open: '11:00', close: '18:30', closed: false },
      }),
    ).toEqual([
      { days: 'Mon', hours: '10:00 AM – 9:00 PM' },
      { days: 'Tue', hours: 'Closed' },
      { days: 'Wed – Fri', hours: '10:00 AM – 9:00 PM' },
      { days: 'Sat', hours: '10:00 AM – 10:00 PM' },
      { days: 'Sun', hours: '11:00 AM – 6:30 PM' },
    ])
  })

  it('is one row when every day is the same', () => {
    const day = { open: '09:00', close: '20:00', closed: false }
    expect(
      weeklyHoursRows({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day }),
    ).toEqual([{ days: 'Mon – Sun', hours: '9:00 AM – 8:00 PM' }])
  })
})

describe('formatCalendarDateIN', () => {
  it('reads a calendar date the Indian way', () => {
    expect(formatCalendarDateIN('2026-12-25')).toBe('25/12/2026')
    expect(formatCalendarDateIN('soon')).toBe('soon')
  })
})
