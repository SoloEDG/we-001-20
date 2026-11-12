import type { Session } from "../../../shared/types";
import { assertBattle } from "../../../shared/document";

function validPointer(s: Session, pointer: unknown): number {
  if (
    typeof pointer === "number" &&
    Number.isInteger(pointer) &&
    pointer >= -1 &&
    pointer <= s.events.length
  )
    return pointer;
  // Older archives never stored a replay pointer: default to the live battle.
  return -1;
}

/**
 * Only explicit step boundaries are persisted. A preview stopped halfway through a
 * walking path is never saved, so a reload lands on the last committed action instead
 * of half a tile. `pointer` is -1 for the live battle.
 */
export function saveArchive(s: Session) {
  s.pointer = validPointer(s, s.pointer);
  localStorage.setItem("we001-session", JSON.stringify(s));
}

export function loadArchive(): Session | null {
  try {
    const raw = localStorage.getItem("we001-session");
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    assertBattle(s.live);
    assertBattle(s.initial);
    if (!Array.isArray(s.events)) return null;
    if (s.events.some((e) => !Array.isArray(e.path))) return null;
    s.pointer = validPointer(s, s.pointer);
    return s;
  } catch {
    return null;
  }
}

export function downloadArchive(s: Session) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "灰烬渡口-战斗记录.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
