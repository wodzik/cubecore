/**
 * The GAN smart timer (Halo / Smart Timer) over Bluetooth — hands on / get
 * set / running / stopped, and the recorded times — from the vendored
 * smartcube-web-bluetooth.
 *
 *   const timer = await connectGanTimer();          // needs a user gesture
 *   timer.events$.subscribe((e) => { if (e.state === GanTimerState.STOPPED) … });
 */

export { connectGanTimer, GanTimerState, makeTime, makeTimeFromTimestamp } from "./vendor/smartcube-web-bluetooth/gan-smart-timer";
export type { GanTimerConnection, GanTimerEvent, GanTimerTime, GanTimerRecordedTimes } from "./vendor/smartcube-web-bluetooth/gan-smart-timer";
