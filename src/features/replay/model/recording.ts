import type { Battle, EventKind, Point, Session } from "../../../shared/types";
import { clone } from "../../../shared/document";

/**
 * Append a committed action. The full before/after snapshots are the source of truth for
 * every replay frame; playback only reads them and never records new history.
 */
export function record(
  s: Session,
  before: Battle,
  kind: EventKind,
  label: string,
  path: Point[] = [],
) {
  s.events.push({
    id: s.events.length + 1,
    kind,
    actor: before.active,
    label,
    path: clone(path),
    before: clone(before),
    after: clone(s.live),
  });
}
