import { computed, reactive, ref, watch } from "vue";
import type { Point, Terrain } from "../shared/types";
import { clone, findUnit, key } from "../shared/document";
import { reachable, terrainRules, paintTile } from "../features/terrain";
import { moveBudget, armorValue, tickStatuses } from "../features/roster";
import {
  getSkill,
  legalTargets,
  moveUnit,
  castSkill,
} from "../features/tactics";
import { finishTurn } from "../features/initiative";
import {
  record,
  loadArchive,
  saveArchive,
  usePlayback,
  activeStep,
  battleAt,
  boundaryTime,
  buildTimeline,
  completedCount,
  pathAt,
  popupsAt,
  walkingPosition,
} from "../features/replay";
import { newSession } from "./session";

export function useWorkspace() {
  const session = reactive(loadArchive() ?? newSession());
  const selected = ref(session.live.active),
    skill = ref(""),
    brush = ref<Terrain | null>(null),
    notice = ref("选择蓝色格移动，或选择技能指定目标。");

  /** The replay timeline is derived data only: playback never appends events. */
  const timeline = computed(() => buildTimeline(session.events));
  const total = computed(() => timeline.value.total);
  // Play-through ends on the fully committed battle already, so stop at the final
  // boundary rather than wrapping back to the start.
  const playback = usePlayback(() => total.value);
  const time = playback.time;

  // Restore the last explicit step boundary, never a half-walked tile. The final
  // boundary is identical to the live battle, so it simply returns to live.
  const restored = session.pointer ?? -1;
  playback.setTime(
    restored < 0 || restored >= session.events.length
      ? -1
      : boundaryTime(timeline.value, restored),
  );

  const previewing = computed(() => time.value >= 0);
  const locked = computed(() => previewing.value || !!session.live.ended);
  const battle = computed(() => battleAt(session, timeline.value, time.value));
  const actor = computed(() => findUnit(battle.value, battle.value.active));
  const walking = computed(() => walkingPosition(timeline.value, time.value));
  const popups = computed(() => popupsAt(timeline.value, time.value));
  const path = computed(() => pathAt(timeline.value, time.value));
  const running = computed(() => activeStep(timeline.value, time.value));
  /** Last settled step; the archive list highlights exactly this boundary. */
  const settled = computed(() =>
    time.value < 0
      ? timeline.value.steps.length
      : completedCount(timeline.value, time.value),
  );
  const activeCursor = computed(() => {
    const step = running.value;
    // On an exact boundary nothing is animating, so only the settled step highlights.
    return step && step.progress > 0.001 ? step.step.cursor : 0;
  });
  const focus = computed(() => {
    const step = running.value?.step;
    if (!step || !step.focus) return null;
    return time.value >= step.impact ? step.focus : null;
  });

  /**
   * Only explicit step boundaries are persisted. Scrubbing keeps the session pointer on
   * the nearest settled step, so a reload never lands on half a walking path.
   */
  watch(
    () => (time.value < 0 ? -1 : completedCount(timeline.value, time.value)),
    (boundary) => {
      if (session.pointer === boundary) return;
      session.pointer = boundary;
      saveArchive(session);
    },
    { immediate: true },
  );

  const routes = computed(() =>
    locked.value || actor.value.moved || actor.value.acted
      ? new Map()
      : reachable(session.live, actor.value, moveBudget(actor.value)),
  );
  const targets = computed(() => {
    const s = getSkill(actor.value.job, skill.value);
    return s ? legalTargets(battle.value, actor.value, s) : [];
  });

  function resetInputs() {
    skill.value = "";
    brush.value = null;
  }

  function cell(p: Point) {
    try {
      if (locked.value)
        throw new Error(previewing.value ? "回放只读，请返回实战" : "战斗已结束");
      const before = clone(session.live),
        u = actor.value;
      if (brush.value) {
        paintTile(session.live, p, brush.value);
        record(
          session,
          before,
          "terrain",
          `地形调整为${terrainRules[brush.value].name}`,
        );
      } else if (skill.value) {
        const s = getSkill(u.job, skill.value)!;
        const t = session.live.units.find((t) => t.hp > 0 && key(t) === key(p));
        if (!t) throw new Error("请点击合法角色");
        const ground = session.live.tiles.find((v) => key(v) === key(t))!;
        const high =
          session.live.tiles.find((v) => key(v) === key(u))!.terrain ===
          "ridge";
        const value = castSkill(
          session.live,
          u.id,
          t.id,
          s,
          armorValue(t),
          terrainRules[ground.terrain].cover,
          high,
        );
        record(
          session,
          before,
          "skill",
          `${u.name} → ${t.name} · ${s.name} ${value}`,
        );
      } else {
        const route = routes.value.get(key(p));
        if (!route?.path.length)
          throw new Error("此格不可达，请检查地形与占位");
        moveUnit(session.live, u.id, route.path);
        record(
          session,
          before,
          "move",
          `${u.name}移动 · 消耗${route.cost}`,
          route.path,
        );
      }
      resetInputs();
      saveArchive(session);
      notice.value = session.events.at(-1)!.label;
    } catch (e) {
      notice.value = (e as Error).message;
    }
  }

  function wait() {
    if (locked.value) return;
    const before = clone(session.live);
    finishTurn(session.live, tickStatuses);
    record(
      session,
      before,
      "wait",
      `${findUnit(before, before.active).name}结束行动`,
    );
    selected.value = session.live.active;
    resetInputs();
    saveArchive(session);
  }

  /** Jump to an exact action boundary; -1 hands control back to the live battle. */
  function seekStep(cursor: number) {
    if (cursor < 0) playback.seek(-1);
    else playback.seek(boundaryTime(timeline.value, cursor));
    resetInputs();
  }

  /** Scrubbing only moves the preview; the committed battle is untouched. */
  function seekTime(at: number) {
    playback.seek(at);
    resetInputs();
  }

  function reset() {
    playback.seek(-1);
    Object.assign(session, newSession());
    session.pointer = -1;
    selected.value = session.live.active;
    resetInputs();
    saveArchive(session);
    notice.value = "新战斗已就绪";
  }

  return {
    session,
    time,
    timeline,
    total,
    playback,
    previewing,
    locked,
    battle,
    actor,
    walking,
    popups,
    focus,
    path,
    settled,
    activeCursor,
    selected,
    skill,
    brush,
    notice,
    routes,
    targets,
    cell,
    wait,
    seekStep,
    seekTime,
    reset,
  };
}
