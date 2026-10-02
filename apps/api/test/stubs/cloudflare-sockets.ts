// Stand-in for the Workers runtime module in Node tests (see vitest.config.ts).
export function connect(): never {
  throw new Error('cloudflare:sockets is only available on Cloudflare Workers');
}
