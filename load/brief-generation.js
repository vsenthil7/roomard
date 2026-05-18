/**
 * k6 load test — brief generation pipeline.
 *
 * NFR target (BRD §11): brief generated within 5s p95 for a property with
 * 100 arrivals on the target day.
 *
 * Usage:
 *   ROOMARD_TOKEN=... ROOMARD_PROPERTY_ID=... \
 *     k6 run --env BASE=http://localhost:3000 load/brief-generation.js
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:3000';
const TOKEN = __ENV.ROOMARD_TOKEN || '';
const PROPERTY_ID = __ENV.ROOMARD_PROPERTY_ID || '';

export const options = {
  scenarios: {
    brief: {
      executor: 'constant-vus',
      vus: 3,
      duration: '60s',
    },
  },
  thresholds: {
    'http_req_duration{name:brief}': ['p(95)<5000'],
    'http_req_failed{name:brief}': ['rate<0.01'],
  },
};

export default function () {
  const params = {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${TOKEN}`,
    },
    tags: { name: 'brief' },
  };
  const body = JSON.stringify({ propertyId: PROPERTY_ID, force: true });
  const res = http.post(`${BASE}/v1/briefs/generate`, body, params);
  check(res, {
    'status is 201': (r) => r.status === 201,
  });
}
