<script setup lang="ts">
import { BattleMap, TerrainPanel } from "../features/terrain";
import { RosterPanel } from "../features/roster";
import { ActionPanel } from "../features/tactics";
import { TurnOrder } from "../features/initiative";
import { ReplayPanel, downloadArchive } from "../features/replay";
import { key } from "../shared/document";
import { useWorkspace } from "./workspace";
const {
  session,
  time,
  timeline,
  total,
  playback,
  previewing,
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
  locked,
  routes,
  targets,
  cell,
  wait,
  seekStep,
  seekTime,
  reset,
} = useWorkspace();
</script>
<template>
  <main>
    <header>
      <a class="brand" href="./"
        ><span class="brand-mark">⌘</span>
        <div>灰烬渡口<small>ASHEN CROSSING / TACTICS LAB</small></div></a
      >
      <nav>
        <span class="nav-active">战术指挥台</span><span>本地演练 / 07</span>
      </nav>
      <button @click="reset">↻ 重新部署</button>
    </header>
    <div class="mission">
      <div>
        <div class="eyebrow">OPERATION 001 / 北境战役</div>
        <h1>在河岸，决定下一步。</h1>
        <p>利用地形，掌握先机。每一次行动，都有迹可循。</p>
      </div>
      <div class="live-badge">
        <i />{{ previewing ? "历史回放 · 只读" : "实战指挥"
        }}<small>消灭敌方所有角色获胜</small>
      </div>
    </div>
    <TurnOrder :battle="battle" />
    <div class="workspace">
      <aside>
        <RosterPanel
          :units="battle.units"
          :selected="selected"
          :active="battle.active"
          @select="selected = $event"
        /><TerrainPanel
          :brush="brush"
          :locked="locked"
          @paint="
            brush = $event;
            skill = '';
          "
        />
      </aside>
      <div class="center">
        <BattleMap
          :battle="battle"
          :selected="selected"
          :routes="[...routes.keys()]"
          :targets="targets.map(key)"
          :path="path"
          :walking="walking"
          :popups="popups"
          :focus="focus"
          @cell="cell"
        />
        <div class="field-note">
          <span>✦ 战场提示</span>
          <p>
            密林提供 3 点掩护；高地攻击 +2；迟缓减少 2
            点移动；灼烧在自身行动结束时结算。
          </p>
        </div>
      </div>
      <aside>
        <ActionPanel
          :unit="actor"
          :skill="skill"
          :locked="locked"
          :notice="notice"
          @skill="
            skill = $event;
            brush = null;
          "
          @wait="wait"
        /><ReplayPanel
          :steps="timeline.steps"
          :time="time"
          :total="total"
          :speeds="playback.speeds"
          :speed="playback.speed.value"
          :playing="playback.playing.value"
          :settled="settled"
          :active-cursor="activeCursor"
          @scrub="seekTime"
          @boundary="seekStep"
          @live="seekStep(-1)"
          @toggle="playback.toggle"
          @speed="playback.setSpeed"
          @download="downloadArchive(session)"
        />
      </aside>
    </div>
    <footer>
      <span>WE–001 / TURN-BASED TACTICS</span
      ><span>自动保存于当前浏览器　·　全部运算在本地完成</span
      ><span>苍蓝军 <b>VS</b> 余烬军</span>
    </footer>
  </main>
</template>
