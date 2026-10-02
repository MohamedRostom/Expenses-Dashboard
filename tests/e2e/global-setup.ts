const MAILPIT_URL = process.env['MAILPIT_URL'] ?? 'http://localhost:8025';
const API_HEALTH_URL = process.env['E2E_API_HEALTH_URL'] ?? 'http://localhost:3000/healthz';

/**
 * T082: `docker compose up --wait` (ci.yml's e2e-ci job) only blocks on services that declare a
 * `healthcheck:` in infra/docker-compose.yml — mailpit has none, so the container can be reported
 * "up" before its REST API is actually accepting connections. auth.spec.ts:169
 * (signUpAndVerify's Mailpit poll) is the first test Playwright runs in the suite, so it's the one
 * that can race that window; every later test finds Mailpit already listening. Raising its 15s
 * timeout would only hide the race, so wait for both Mailpit and the API to answer here instead,
 * before any test starts.
 *
 * Gated on E2E_WAIT_FOR_STACK (set by ci.yml only) so the `local`/`pixel-7`/`iphone-14` projects —
 * which run against a real deployed URL with no local Mailpit — never try to reach one.
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env['E2E_WAIT_FOR_STACK']) return;
  await waitUntilReady(`${MAILPIT_URL}/api/v1/messages`, 'Mailpit');
  await waitUntilReady(API_HEALTH_URL, 'the API');
}

async function waitUntilReady(url: string, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastError = new Error(`${label} responded ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `globalSetup: ${label} not ready at ${url} within ${timeoutMs}ms (last error: ${String(lastError)})`,
  );
}
