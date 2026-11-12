<script setup lang="ts">
import type { Battle, Point } from "../../../shared/types";
import { key } from "../../../shared/document";
import { terrainRules } from "../lib/cost";
import type { PopupView, WalkPosition } from "../../replay";

defineProps<{
  battle: Battle;
  selected: string;
  routes: string[];
  targets: string[];
  path: Point[];
  walking: WalkPosition | null;
  popups: PopupView[];
  focus: Point | null;
}>();
defineEmits<{ cell: [point: Point] }>();

const glyph: Record<string, string> = {
  guard: "♜",
  ranger: "➶",
  mage: "✦",
  medic: "✚",
};

/** Labels are driven by timeline progress, so pause and scrub freeze them correctly. */
const popupStyle = (p: PopupView) => {
  const appear = Math.min(1, p.progress / 0.18);
  const fade = Math.max(0, Math.min(1, (p.progress - 0.55) / 0.45));
  return {
    opacity: String(appear * (1 - fade)),
    transform: `translate(-50%, ${-8 - p.progress * 20}px) scale(${0.85 + appear * 0.2})`,
  };
};

/** Place the walking token at the interpolated cell centre, whatever the cell size. */
const walkerStyle = (w: WalkPosition) => ({
  left: `${((w.x + 0.5) / 12) * 100}%`,
  top: `${((w.y + 0.5) / 8) * 100}%`,
  width: `calc((100% / 12) * 0.78)`,
  height: `calc((100% / 8) * 0.78)`,
});
</script>
<template>
  <section class="map-frame">
    <div class="map-caption">
      <span>渡口 07 / 北部边境</span><span>12 × 8 · 四向网格</span>
    </div>
    <div class="battle-map" role="grid" aria-label="战术地图">
      <button
        v-for="tile in battle.tiles"
        :key="key(tile)"
        :data-cell="key(tile)"
        :class="[
          'tile',
          tile.terrain,
          {
            reachable: routes.includes(key(tile)),
            target: targets.includes(key(tile)),
            trail: path.some((p) => key(p) === key(tile)),
            focus: !!focus && key(focus) === key(tile),
          },
        ]"
        :aria-label="`${tile.x},${tile.y} ${terrainRules[tile.terrain].name}`"
        @click="$emit('cell', tile)"
      >
        <span class="ground">{{ terrainRules[tile.terrain].glyph }}</span
        ><template
          v-for="unit in battle.units.filter(
            (u) => u.hp > 0 && key(u) === key(tile) && u.id !== walking?.id,
          )"
          :key="unit.id"
          ><span
            :class="[
              'pawn',
              unit.team,
              {
                selected: unit.id === selected,
                active: unit.id === battle.active,
              },
            ]"
            >{{ glyph[unit.job] }}<i
              :style="{
                width: (unit.hp / unit.maxHp) * 100 + '%',
              }" /></span></template
        ><small>{{ tile.x + 1 }}·{{ tile.y + 1 }}</small
        ><template
          v-for="p in popups.filter(
            (v) => Math.round(v.x) === tile.x && Math.round(v.y) === tile.y,
          )"
          :key="p.id"
          ><span class="popup" :class="p.tone" :style="popupStyle(p)">{{
            p.text
          }}</span></template
        >
      </button>
      <template v-if="walking">
        <span
          class="pawn walker"
          :class="walking.team"
          :style="walkerStyle(walking)"
          >{{ glyph[walking.job] }}<i
            :style="{ width: (walking.hp / walking.maxHp) * 100 + '%' }" /></span
        >
      </template>
    </div>
    <div class="map-caption">
      <span>浅滩纵贯南北 · 中央石桥可快速渡河</span
      ><span>◇ 当前行动　● 可移动　◈ 技能目标</span>
    </div>
  </section>
</template>
