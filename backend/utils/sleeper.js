import { isDatabaseConnected } from '../config/db.js';

// 😴 Runs a job when there's something for it to do, instead of asking the
// database every few seconds whether there is.
//
// After each run it asks once when the next piece of work is due and sleeps
// until then. Whoever creates work that's due sooner calls wake(at). With
// nothing pending it still looks every maxSleepMs: that catches work this
// process was never told about (another server made it, a wake was missed,
// the database was away), so being late is the worst that can happen.
//
//   run()      does everything that's due now
//   nextDue()  when the next thing is due (a Date), or null if nothing is waiting
export function sleeper({ name, run, nextDue, maxSleepMs }) {
  let timer = null;
  let wakeAt = Infinity; // when the timer will go off
  let running = false;
  let wokenMeanwhile = false;

  function plan(at) {
    const when = Math.min(at, Date.now() + maxSleepMs);
    if (timer && when >= wakeAt) return; // already waking up early enough
    clearTimeout(timer);
    wakeAt = when;
    timer = setTimeout(cycle, Math.max(0, when - Date.now()));
    timer.unref();
  }

  async function cycle() {
    timer = null;
    wakeAt = Infinity;
    if (running) {
      wokenMeanwhile = true; // something new came in mid-run: go round again after it
      return;
    }
    if (!isDatabaseConnected()) return plan(Date.now() + RETRY_WITHOUT_DATABASE_MS);

    running = true;
    let next = null;
    try {
      await run();
      next = await nextDue();
    } catch (err) {
      console.error(`[${name}]`, err);
    }
    running = false;

    if (wokenMeanwhile) {
      wokenMeanwhile = false;
      return cycle();
    }
    plan(next ? new Date(next).getTime() : Infinity);
  }

  return {
    start: cycle,
    // at: when the new work is due (a Date). Left out: right now.
    wake: (at) => plan(at ? new Date(at).getTime() : Date.now()),
  };
}

const RETRY_WITHOUT_DATABASE_MS = 15 * 1000;
