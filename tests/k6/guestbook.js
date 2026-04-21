/**
 * Guestbook k6 test — two concurrent user scenarios:
 *
 *   writers  – add a guest entry every 5 min, then verify it appears in the list
 *   readers  – query the full list every 5 s
 *
 * Environment variables (all optional):
 *   BASE_URL     — guestbook service URL  (default: http://localhost:3000)
 *   WRITER_VUS   — concurrent writer VUs  (default: 2)
 *   READER_VUS   — concurrent reader VUs  (default: 10)
 *   DURATION     — test duration          (default: 10m)
 *
 * Usage:
 *   k6 run \
 *     -e BASE_URL=http://<svc-ip>:3000 \
 *     -e WRITER_VUS=2 \
 *     -e READER_VUS=10 \
 *     -e DURATION=10m \
 *     tests/k6/guestbook.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL   = __ENV.BASE_URL    || 'http://localhost:3000';
const WRITER_VUS = parseInt(__ENV.WRITER_VUS  || '2',  10);
const READER_VUS = parseInt(__ENV.READER_VUS  || '10', 10);
const DURATION   = __ENV.DURATION    || '10m';

const writeLatency  = new Trend('write_latency',  true);
const readLatency   = new Trend('read_latency',   true);
const writeErrors   = new Counter('write_errors');
const readErrors    = new Counter('read_errors');
const verifyErrors  = new Counter('verify_errors');

export const options = {
  scenarios: {
    writers: {
      executor: 'constant-vus',
      vus: WRITER_VUS,
      duration: DURATION,
      exec: 'writer',
    },
    readers: {
      executor: 'constant-vus',
      vus: READER_VUS,
      duration: DURATION,
      exec: 'reader',
    },
  },
  thresholds: {
    http_req_failed:  ['rate<0.01'],
    write_latency:    ['p(95)<2000'],
    read_latency:     ['p(95)<500'],
  },
};

export function writer() {
  // Unique-enough message so we can verify it appears after the write.
  const guest = `vu${__VU}-${Date.now()}`;

  group('add guest', () => {
    const res = http.get(`${BASE_URL}/rpush/guestbook/${encodeURIComponent(guest)}`);
    writeLatency.add(res.timings.duration);

    const ok = check(res, {
      'add: status 200': (r) => r.status === 200,
    });
    if (!ok) writeErrors.add(1);
  });

  group('verify guest added', () => {
    const res = http.get(`${BASE_URL}/lrange/guestbook`);
    readLatency.add(res.timings.duration);

    const ok = check(res, {
      'verify: status 200': (r) => r.status === 200,
      'verify: guest in list': (r) => r.body !== null && r.body.includes(guest),
    });
    if (!ok) verifyErrors.add(1);
  });

  sleep(300); // 5 minutes between writes per VU
}

export function reader() {
  group('query list', () => {
    const res = http.get(`${BASE_URL}/lrange/guestbook`);
    readLatency.add(res.timings.duration);

    const ok = check(res, {
      'read: status 200': (r) => r.status === 200,
    });
    if (!ok) readErrors.add(1);
  });

  sleep(5); // 5 seconds between reads per VU
}
