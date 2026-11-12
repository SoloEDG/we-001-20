import { ref, onUnmounted } from "vue";

export const SPEEDS = [0.5, 1, 1.5, 2, 3] as const;

/** Ignore long frames (e.g. a hidden tab) so the preview never jumps on return. */
const MAX_FRAME_MS = 250;

/**
 * Wall-clock preview clock. Speed scales how quickly the timeline time advances.
 * The battle engine commits every result on its own; this clock only previews them,
 * so pausing, fast-forwarding, changing speed mid-play or a background tab can never
 * change combat results.
 */
export function usePlayback(total: () => number) {
  const time = ref(-1);
  const speed = ref(1);
  const playing = ref(false);
  let raf = 0;
  let last = 0;

  function cancel() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
  }

  function stop() {
    playing.value = false;
    cancel();
  }

  function frame(now: number) {
    raf = 0;
    if (!playing.value) return;
    const end = total();
    const elapsed = last ? Math.min(Math.max(0, now - last), MAX_FRAME_MS) : 0;
    last = now;
    if (elapsed) time.value = Math.min(end, time.value + elapsed * speed.value);
    if (!end || time.value >= end) {
      stop();
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  /** Start (or resume) from the current time; never rewinds a paused preview. */
  function play() {
    const end = total();
    if (!end) return;
    if (time.value < 0 || time.value >= end) time.value = 0;
    if (playing.value) return;
    playing.value = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function pause() {
    if (!playing.value) return;
    stop();
  }

  function toggle() {
    if (playing.value) pause();
    else play();
  }

  /** -1 returns to the live battle. Seeking is only a preview until committed. */
  function seek(at: number) {
    stop();
    time.value = at < 0 ? -1 : Math.max(0, Math.min(total(), at));
  }

  function setTime(at: number) {
    stop();
    time.value = at < 0 ? -1 : Math.max(0, Math.min(total(), at));
  }

  /** Changing speed while paused keeps the time; while playing it continues from there. */
  function setSpeed(value: number) {
    if (!SPEEDS.includes(value as (typeof SPEEDS)[number])) return;
    if (playing.value) last = performance.now();
    speed.value = value;
  }

  /**
   * The tab goes to the background: stop scheduling frames but remember that the user
   * still wants playback. The engine already committed all results, so this can slow
   * the preview but never change the battle.
   */
  function sleep() {
    cancel();
  }

  function wake() {
    if (!playing.value) return;
    last = performance.now();
    if (!raf && time.value >= 0) raf = requestAnimationFrame(frame);
  }

  const visibility = () => (document.hidden ? sleep() : wake());
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", visibility);
  onUnmounted(() => {
    stop();
    if (typeof document !== "undefined")
      document.removeEventListener("visibilitychange", visibility);
  });

  return {
    time,
    speed,
    speeds: SPEEDS,
    playing,
    play,
    pause,
    toggle,
    seek,
    setTime,
    setSpeed,
  };
}
