/**
 * A leading-plus-trailing throttle for workspace writes (ADR 0004): the
 * first schedule in a quiet period writes immediately, a burst of further
 * schedules collapses into one trailing write per interval. flush() exists
 * so page-hide handlers can force the trailing write out before unload.
 */
export type WriteScheduler = {
  schedule: () => void;
  flush: () => void;
  dispose: () => void;
};

export function createWriteScheduler(
  write: () => void,
  intervalMs: number,
): WriteScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;

  const onInterval = () => {
    if (dirty) {
      dirty = false;
      write();
      timer = setTimeout(onInterval, intervalMs);
    } else {
      timer = undefined;
    }
  };

  return {
    schedule() {
      if (timer === undefined) {
        write();
        timer = setTimeout(onInterval, intervalMs);
      } else {
        dirty = true;
      }
    },
    flush() {
      if (dirty) {
        dirty = false;
        write();
      }
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
    dispose() {
      dirty = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
