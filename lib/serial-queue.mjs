// Serial task queue.
//
// Serialises async read-modify-write sequences so concurrent callers cannot
// interleave (e.g. two bookings racing for the same slot). Each queued task
// runs to completion — success or failure — before the next one starts.

/** Creates an `enqueue(task)` function; tasks run one at a time, in order. */
export function createSerialQueue() {
  let queue = Promise.resolve();
  return function enqueue(task) {
    const result = queue.then(task, task);
    // Keep the chain alive even when a task rejects.
    queue = result.catch(() => { });
    return result;
  };
}
