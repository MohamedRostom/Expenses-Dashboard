// T018: job registry — plain Map, no DI framework needed.
export type JobHandler = (
  payload: unknown,
  ctx: { updateProgress(done: number, total?: number): Promise<void> },
) => Promise<void>;

export const jobs = new Map<string, JobHandler>();

export function registerJob(name: string, handler: JobHandler): void {
  jobs.set(name, handler);
}

// Export job factory functions for registration in app.ts
export { panelsRefreshJob, type PanelsRefreshDeps } from './panels-refresh.js';
export { panelsSchedulerJob, type PanelsSchedulerDeps } from './panels-scheduler.js';
