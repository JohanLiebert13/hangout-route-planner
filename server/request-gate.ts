export function aborted(): Error { const error = new Error('Request cancelled.'); error.name = 'AbortError'; return error; }
export function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw aborted(); }
export function isAbortError(error: unknown): boolean { return error instanceof Error && error.name === 'AbortError'; }
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    const timer = setTimeout(finish, ms);
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(aborted()); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
/** Serial queue with a minimum interval between request starts. Cancelled queued
 * jobs stay in the chain, so they cannot release later work ahead of an active job. */
export class RequestGate {
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = 0;
  intervalMs: number;
  constructor(intervalMs: number) { this.intervalMs = intervalMs; }
  run<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const work = this.tail.then(async () => {
      checkAbort(signal);
      const wait = Math.max(0, this.lastStart + this.intervalMs - Date.now());
      if (wait) await sleep(wait, signal);
      checkAbort(signal); this.lastStart = Date.now();
      return action();
    });
    this.tail = work.catch(() => {});
    if (!signal) return work;
    return new Promise<T>((resolve, reject) => {
      const cancel = () => reject(aborted());
      if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
      work.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
    });
  }
}
