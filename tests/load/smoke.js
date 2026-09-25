// T110: k6 smoke — 50 virtual users hitting the month view, p95 server time under 500ms.
// Run: k6 run tests/load/smoke.js
// Env: BASE_URL (default http://localhost:3000), SESSION_COOKIE + CSRF_COOKIE/CSRF_HEADER for
// an authenticated GET against a seeded user (packages/db/src/seed.ts's e2e user), MONTH
// (default the current UTC month, YYYY-MM).
/* global __ENV -- k6's own runtime global (env vars passed via `k6 run -e`), not Node/browser. */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';
const MONTH = __ENV.MONTH || new Date().toISOString().slice(0, 7);

export const options = {
  vus: 50,
  duration: '30s',
  thresholds: {
    // Server-side p95 under 500ms — a threshold failure fails the k6 run (exit code 99).
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/summary/month?month=${MONTH}`, {
    headers: SESSION_COOKIE ? { Cookie: `__Host-desk_session=${SESSION_COOKIE}` } : {},
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
