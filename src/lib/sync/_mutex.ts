// Promise-chain mutex. Returns a function that serializes all operations
// against the same chain. Each mutator awaits the previous one to finish.
// NB: if a mutator rejects, the chain continues (we swallow in the chain
// but re-throw to the caller) so one failure doesn't block later work.
export function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {
      /* swallow to keep chain alive; caller already saw the rejection */
    });
    return run as Promise<T>;
  };
}
