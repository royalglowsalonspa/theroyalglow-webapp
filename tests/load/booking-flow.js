import { check, sleep } from 'k6'
import http from 'k6/http'

// k6 load test for the booking-flow read path. Fails the CI gate when the 95th
// percentile latency reaches 500ms or the request error rate reaches 1%.
const TARGET = __ENV.K6_TARGET_URL || 'http://localhost:3000'

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
}

export default function () {
  const home = http.get(`${TARGET}/`)
  check(home, { 'home 200': (r) => r.status === 200 })

  const services = http.get(`${TARGET}/api/services`)
  check(services, { 'services ok': (r) => r.status === 200 || r.status === 404 })

  const health = http.get(`${TARGET}/api/health`)
  check(health, { 'health ok': (r) => r.status === 200 })

  sleep(1)
}
