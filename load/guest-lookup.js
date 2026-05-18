/**
 * k6 load test — guest lookup latency budget.
 *
 * NFR target (BRD §11): guest profile loaded within 1.5s p99 on 4G.
 *
 * We run a steady 50 VU ramp for 2 min and assert:
 *   - p99 < 1500ms
 *   - error rate < 1%
 *
 * Usage:
 *   ROOMARD_TOKEN=eyJ... ROOMARD_GUEST_ID=... \
 *     k6 run --env BASE=https://api.roomard.local load/guest-lookup.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:3000';
const TOKEN = __ENV.ROOMARD_TOKEN || '';
const GUEST_ID = __ENV.ROOMARD_GUEST_ID || '';

export const options = {
  scenarios: {
    guest_lookup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 25 },
        { duration: '60s', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    'http_req_duration{name:lookup}': ['p(99)<1500'],
    'http_req_failed{name:lookup}': ['rate<0.01'],
  },
};

const lookupTrend = new Trend('lookup_latency');
const errorRate = new Rate('errors');

export default function () {
  const params = {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    tags: { name: 'lookup' },
  };
  const res = http.get(`${BASE}/v1/guests/${GUEST_ID}`, params);
  lookupTrend.add(res.timings.duration);
  errorRate.add(res.status !== 200);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'has guest body': (r) => {
      try { return !!JSON.parse(r.body).id; }
      catch { return false; }
    },
  });
  sleep(1);
}
