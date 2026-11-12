import type {
  Battle,
  BattleEvent,
  EventKind,
  Point,
  Session,
  Unit,
} from "../../../shared/types";
import { clone, findUnit } from "../../../shared/document";
import { statusNames } from "../../roster/lib/status";

/** Logical step lengths, in timeline milliseconds. Speed only scales the clock. */
export const MOVE_STEP_MS = 320;
export const SKILL_MS = 840;
export const WAIT_MS = 560;
export const TERRAIN_MS = 400;
export const POPUP_MS = 900;
const MOVE_MIN_MS = 200;
const IMPACT_RATIO: Record<Exclude<EventKind, "move">, number> = {
  skill: 0.4,
  wait: 0.52,
  terrain: 0.55,
};

export type PopupTone = "damage" | "heal" | "status" | "note";

export interface ReplayPopup {
  id: string;
  /** Timeline time at which the label appears. */
  at: number;
  /** Timeline time at which the label expires. */
  until: number;
  x: number;
  y: number;
  text: string;
  tone: PopupTone;
}

export interface ReplayStep {
  /** 1-based archive index. */
  cursor: number;
  event: BattleEvent;
  kind: EventKind;
  start: number;
  end: number;
  /** Logical settlement point inside the step. */
  impact: number;
  /** Tile that receives the casting / settling emphasis, when the step has one. */
  focus?: Point;
}

export interface ReplayTimeline {
  steps: ReplayStep[];
  /** Total logical duration. */
  total: number;
  /** [0, end(step 1), ... , end(last)] — the exact action boundaries. */
  boundaries: number[];
  popups: ReplayPopup[];
}

export interface ActiveStep {
  step: ReplayStep;
  /** 0 at the step boundary, 1 when the step settles. */
  progress: number;
}

export function stepDuration(e: BattleEvent) {
  switch (e.kind) {
    case "move":
      return Math.max(MOVE_MIN_MS, e.path.length * MOVE_STEP_MS);
    case "skill":
      return SKILL_MS;
    case "wait":
      return WAIT_MS;
    case "terrain":
      return TERRAIN_MS;
  }
}

function impactAt(kind: EventKind, start: number, end: number) {
  return kind === "move" ? end : start + (end - start) * IMPACT_RATIO[kind];
}

function changedUnit(e: BattleEvent) {
  return e.after.units.find((u) => {
    const before = e.before.units.find((v) => v.id === u.id);
    if (!before) return false;
    return (
      u.hp !== before.hp ||
      u.statuses.some(
        (s) => !before.statuses.some((v) => v.kind === s.kind),
      )
    );
  });
}

function focusOf(e: BattleEvent): Point | undefined {
  if (e.kind === "skill" || e.kind === "wait") {
    const u = changedUnit(e);
    return u ? { x: u.x, y: u.y } : undefined;
  }
  if (e.kind === "terrain") {
    const tile = e.after.tiles.find((t) => {
      const before = e.before.tiles.find((v) => v.x === t.x && v.y === t.y);
      return before && before.terrain !== t.terrain;
    });
    return tile ? { x: tile.x, y: tile.y } : undefined;
  }
  return undefined;
}

function skillPopups(e: BattleEvent, at: number, prefix: string) {
  return e.after.units.flatMap((u) => {
    const before = e.before.units.find((v) => v.id === u.id);
    if (!before) return [];
    const delta = u.hp - before.hp;
    const gained = u.statuses.filter(
      (s) => !before.statuses.some((v) => v.kind === s.kind),
    );
    if (!delta && !gained.length) return [];
    const parts: string[] = [];
    if (delta) parts.push(delta < 0 ? `−${-delta}` : `+${delta}`);
    for (const s of gained) parts.push(statusNames[s.kind]);
    if (before.hp > 0 && u.hp <= 0) parts.push("击倒");
    return [
      {
        id: `${prefix}:${u.id}`,
        at,
        until: at + POPUP_MS,
        x: u.x,
        y: u.y,
        text: parts.join(" "),
        tone: (delta < 0
          ? "damage"
          : delta > 0
            ? "heal"
            : "status") as PopupTone,
      },
    ];
  });
}

/** Burning ticks and expiring statuses settle when the ending action settles. */
function waitPopups(e: BattleEvent, at: number, prefix: string) {
  return e.after.units.flatMap((u) => {
    const before = e.before.units.find((v) => v.id === u.id);
    if (!before) return [];
    const parts: string[] = [];
    if (before.hp > u.hp) parts.push(`灼烧 −${before.hp - u.hp}`);
    const lost = before.statuses.filter(
      (s) => !u.statuses.some((v) => v.kind === s.kind),
    );
    for (const s of lost) parts.push(`${statusNames[s.kind]}解除`);
    if (!parts.length) return [];
    if (before.hp > 0 && u.hp <= 0) parts.push("击倒");
    return [
      {
        id: `${prefix}:${u.id}`,
        at,
        until: at + POPUP_MS,
        x: u.x,
        y: u.y,
        text: parts.join(" "),
        tone: (before.hp > u.hp ? "damage" : "status") as PopupTone,
      },
    ];
  });
}

export function buildTimeline(events: BattleEvent[]): ReplayTimeline {
  const steps: ReplayStep[] = [];
  const popups: ReplayPopup[] = [];
  let time = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const start = time;
    const end = start + stepDuration(event);
    const impact = impactAt(event.kind, start, end);
    steps.push({
      cursor: i + 1,
      event,
      kind: event.kind,
      start,
      end,
      impact,
      focus: focusOf(event),
    });
    const prefix = String(event.id);
    if (event.kind === "skill")
      popups.push(...skillPopups(event, impact, prefix));
    if (event.kind === "wait")
      popups.push(...waitPopups(event, impact, prefix));
    time = end;
  }
  return {
    steps,
    total: time,
    boundaries: [0, ...steps.map((s) => s.end)],
    popups,
  };
}

/** Number of steps fully settled at `time`. */
export function completedCount(timeline: ReplayTimeline, time: number) {
  let n = 0;
  while (n < timeline.steps.length && timeline.steps[n].end <= time + 1e-6) n++;
  return n;
}

/** Exact timeline time of the archive boundary after `cursor` steps. */
export function boundaryTime(timeline: ReplayTimeline, cursor: number) {
  const n = Math.max(0, Math.min(timeline.steps.length, Math.floor(cursor)));
  return timeline.boundaries[n] ?? 0;
}

export function activeStep(
  timeline: ReplayTimeline,
  time: number,
): ActiveStep | null {
  if (time < 0 || time >= timeline.total) return null;
  const step = timeline.steps[completedCount(timeline, time)];
  if (!step) return null;
  const span = step.end - step.start || 1;
  return {
    step,
    progress: Math.max(0, Math.min(1, (time - step.start) / span)),
  };
}

/**
 * A wait step settles its HP/status tick at the tick point, but formation, initiative
 * and the turn handoff only advance when the step ends, so a half-played wait never
 * reorders the queue.
 */
function waitTickState(e: BattleEvent): Battle {
  const b = clone(e.after);
  b.queue = clone(e.before.queue);
  b.active = e.before.active;
  b.round = e.before.round;
  b.ended = e.before.ended;
  for (const u of b.units) {
    const prev = e.before.units.find((v) => v.id === u.id);
    if (!prev) continue;
    u.moved = prev.moved;
    u.acted = prev.acted;
  }
  return b;
}

/**
 * Board state at a timeline time. `time < 0` is the live battle. Logical results
 * (damage, status, terrain, turn handoff) appear at their own settlement point, never
 * when the display animation happens to finish; playback never mutates or records.
 */
export function battleAt(
  session: Session,
  timeline: ReplayTimeline,
  time: number,
): Battle {
  if (time < 0) return session.live;
  if (!timeline.steps.length) return session.initial;
  const count = completedCount(timeline, time);
  if (count >= timeline.steps.length)
    return timeline.steps[timeline.steps.length - 1].event.after;
  const step = timeline.steps[count];
  if (time < step.impact)
    return count === 0 ? session.initial : step.event.before;
  return step.kind === "wait" ? waitTickState(step.event) : step.event.after;
}

export interface WalkPosition extends Point {
  id: string;
  job: Unit["job"];
  team: Unit["team"];
  hp: number;
  maxHp: number;
}

/** Interpolated walking position during a move step, or null when nobody walks. */
export function walkingPosition(
  timeline: ReplayTimeline,
  time: number,
): WalkPosition | null {
  const active = activeStep(timeline, time);
  if (!active || active.step.kind !== "move") return null;
  // On a boundary the committed pawn already sits on its tile; only animate in between.
  if (active.progress <= 0.001 || active.progress >= 0.999) return null;
  const event = active.step.event;
  if (!event.path.length) return null;
  const unit = findUnit(event.before, event.actor);
  const points: Point[] = [unit, ...event.path];
  const segments = points.length - 1;
  const travel = active.progress * segments;
  const index = Math.min(segments - 1, Math.floor(travel));
  const fraction = travel - index;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const a = points[index],
    b = points[index + 1];
  return {
    id: event.actor,
    job: unit.job,
    team: unit.team,
    hp: unit.hp,
    maxHp: unit.maxHp,
    x: a.x + (b.x - a.x) * eased,
    y: a.y + (b.y - a.y) * eased,
  };
}

export interface PopupView extends ReplayPopup {
  /** 0 when the label appears, 1 when it expires. */
  progress: number;
}

export function popupsAt(timeline: ReplayTimeline, time: number): PopupView[] {
  return timeline.popups
    .filter((p) => time >= p.at && time < p.until)
    .map((p) => ({ ...p, progress: (time - p.at) / (p.until - p.at) }));
}

/** The path currently being walked, or the trail of the last settled move. */
export function pathAt(timeline: ReplayTimeline, time: number): Point[] {
  if (time < 0) return [];
  const active = activeStep(timeline, time);
  if (active && active.progress > 0.01) return active.step.event.path;
  const count = completedCount(timeline, time);
  return count > 0 ? timeline.steps[count - 1].event.path : [];
}
