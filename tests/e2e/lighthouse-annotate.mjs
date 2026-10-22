// Prints one GitHub Actions ::error annotation per failed error-level lhci assertion, so a
// Lighthouse budget miss shows on the check run. Usage: node lighthouse-annotate.mjs <assertion-results.json>
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const out = (line) => process.stdout.write(`${line}\n`);
const file = process.argv[2] ?? '.lighthouseci/assertion-results.json';
if (!existsSync(file)) {
  out(`::error title=Lighthouse::no assertion results at ${file} (lhci did not finish)`);
  process.exit(0);
}
for (const r of JSON.parse(readFileSync(file, 'utf8'))) {
  if (r.passed || r.level !== 'error') continue;
  const what = r.auditProperty ? `${r.auditId}:${r.auditProperty}` : r.auditId;
  out(
    `::error title=Lighthouse ${what}::${r.url} ${r.name} expected ${r.operator} ${r.expected}, got ${r.actual}`,
  );
}
