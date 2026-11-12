<script setup lang="ts">
import type { ReplayStep } from "../../../features/replay";
defineProps<{
  steps: ReplayStep[];
  time: number;
  total: number;
  speeds: readonly number[];
  speed: number;
  playing: boolean;
  settled: number;
  activeCursor: number;
}>();
defineEmits<{
  scrub: [time: number];
  boundary: [cursor: number];
  live: [];
  toggle: [];
  speed: [value: number];
  download: [];
}>();

const glyph = (kind: string) =>
  kind === "move"
    ? "↗"
    : kind === "skill"
      ? "✧"
      : kind === "terrain"
        ? "△"
        : "→";

const clock = (ms: number) => {
  const safe = Math.max(0, ms) / 1000;
  return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(1).padStart(4, "0")}`;
};

const percent = (value: number, total: number) =>
  `${(value / (total || 1)) * 100}%`;
</script>
<template>
  <section class="panel replay-panel">
    <div class="eyebrow">04 / BATTLE ARCHIVE</div>
    <h3>
      战斗回放 <small>{{ steps.length }} 步记录</small>
    </h3>
    <div class="replay-tools">
      <button
        :aria-label="playing ? '暂停回放' : '播放回放'"
        @click="$emit('toggle')"
      >
        {{ playing ? "Ⅱ 暂停" : "▶ 播放" }}</button
      ><button @click="$emit('live')">返回实战</button
      ><button @click="$emit('download')">导出记录 ↓</button>
    </div>
    <div class="speed-row" role="group" aria-label="回放倍速">
      <span>倍速</span>
      <button
        v-for="value in speeds"
        :key="value"
        :class="{ chosen: speed === value }"
        @click="$emit('speed', value)"
      >
        {{ value }}×
      </button>
    </div>
    <div class="replay-clock">
      <b>{{ clock(time < 0 ? total : time) }}</b
      ><small>/ {{ clock(total) }}</small
      ><span>{{ time < 0 ? "实战状态" : "回放预览" }}</span>
    </div>
    <input
      aria-label="回放进度"
      type="range"
      min="0"
      :max="Math.max(total, 1)"
      step="10"
      :value="time < 0 ? total : time"
      @input="$emit('scrub', Number(($event.target as HTMLInputElement).value))"
    />
    <div class="step-track" aria-hidden="true">
      <i
        v-for="(step, i) in steps"
        :key="step.event.id"
        :class="{ settled: i < settled, current: i + 1 === activeCursor }"
        :style="{
          left: percent(step.start, total),
          width: percent(step.end - step.start, total),
        }"
      />
      <span
        v-if="time >= 0 && steps.length"
        class="step-hand"
        :style="{ left: percent(time, total) }"
      />
    </div>
    <div class="event-list">
      <button
        :class="{ chosen: settled === 0 && time >= 0 }"
        @click="$emit('boundary', 0)"
      >
        <small>00</small>战斗开始</button
      ><button
        v-for="(step, i) in steps"
        :key="step.event.id"
        :class="{
          chosen: settled === i + 1 && time >= 0,
          running: activeCursor === i + 1 && time >= 0,
        }"
        @click="$emit('boundary', i + 1)"
      >
        <small>{{ String(step.event.id).padStart(2, "0") }}</small
        >{{ step.event.label }}<span>{{ glyph(step.kind) }}</span>
      </button>
    </div>
  </section>
</template>
