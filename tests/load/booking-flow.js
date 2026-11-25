import { check, sleep } from 'k6'
import http from 'k6/http'

// Exercise the built web app and its synthetic booking catalogue on the runner.
const TARGET = 'http://127.0.0.1:3000'

export const options = {
  maxRedirects: 0,
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    checks: ['rate==1'],
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
}

function responseField(response, selector) {
  if (response.status !== 200) {
    return null
  }
  try {
    return response.json(selector)
  } catch {
    return null
  }
}

export default function () {
  const home = http.get(`${TARGET}/`)
  check(home, { 'home 200': (r) => r.status === 200 })

  const services = http.get(`${TARGET}/api/services`)
  check(services, {
    'catalogue has seeded categories': (r) => {
      const categories = responseField(r, 'data.categories')
      return Array.isArray(categories) && categories.length > 0
    },
  })

  const tomorrowIst = new Date(Date.now() + (24 * 60 + 330) * 60_000).toISOString().slice(0, 10)
  const availability = http.get(
    `${TARGET}/api/availability?date=${tomorrowIst}&durationMinutes=45`,
    { tags: { name: 'booking availability' } },
  )
  check(availability, {
    'availability returns its slot grid': (r) => Array.isArray(responseField(r, 'data.slots')),
  })

  const health = http.get(`${TARGET}/api/health`)
  check(health, {
    'database health passes': (r) => responseField(r, 'checks.database.status') === 'pass',
  })

  sleep(1)
}
