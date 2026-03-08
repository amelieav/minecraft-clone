<template>
  <div class="app">
    <header class="topbar">
      <div class="title">Mineclone - Babylon FPS</div>
      <div class="stats">
        <div>Pos: {{ player.x.toFixed(1) }}, {{ player.y.toFixed(1) }}, {{ player.z.toFixed(1) }}</div>
        <div>FPS: {{ perf.fps.toFixed(0) }}</div>
        <div>Selected: {{ selectedBlockName }}</div>
        <div>Mode: {{ buildMode ? 'Place' : 'Mine' }}</div>
      </div>
    </header>

    <div class="game">
      <canvas ref="canvasRef" class="game-canvas"></canvas>
      <div class="hud">
        <div v-if="startError" class="hud-row error">
          <div class="label">Startup Error</div>
          <div class="error-text">{{ startError }}</div>
        </div>

        <div class="hud-row">
          <div class="label">Hotbar</div>
          <div class="hotbar">
            <button
              v-for="(slot, i) in hotbar"
              :key="i"
              :class="['slot', { active: i === activeSlot }]"
              @click="activeSlot = i"
            >
              <span class="slot-name">{{ slot.name }}</span>
              <span class="slot-count">{{ slot.count }}</span>
            </button>
          </div>
        </div>

        <div class="hud-row">
          <div class="label">Inventory</div>
          <div class="inventory">
            <div class="inv-item" v-for="item in inventoryList" :key="item.name">
              <span>{{ item.name }}</span>
              <span>{{ item.count }}</span>
            </div>
          </div>
        </div>

        <div class="hud-row">
          <div class="label">Crafting</div>
          <div class="crafting">
            <button class="craft-btn" @click="craftPlanks" :disabled="inventory.logs < 1">
              Craft 4 Planks (1 Log)
            </button>
            <button class="craft-btn" @click="craftStick" :disabled="inventory.planks < 2">
              Craft 4 Sticks (2 Planks)
            </button>
          </div>
        </div>

        <div class="hud-row">
          <div class="label">Controls</div>
          <div class="controls">
            <div>Click canvas: lock mouse</div>
            <div>Mouse: look around</div>
            <div>WASD: move</div>
            <div>Shift: sprint</div>
            <div>Space: jump</div>
            <div>Left click: mine (or place in place mode)</div>
            <div>Right click: place</div>
            <div>Q: toggle place/mine</div>
            <div>1-5: select hotbar</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useBabylonMineclone } from './composables/useBabylonMineclone'

const canvasRef = ref(null)

const {
  perf,
  player,
  inventory,
  hotbar,
  inventoryList,
  buildMode,
  activeSlot,
  selectedBlockName,
  startError,
  start,
  craftPlanks,
  craftStick,
} = useBabylonMineclone()

onMounted(async () => {
  try {
    await start(canvasRef.value)
  } catch {
    // Error is exposed via startError for on-screen visibility.
  }
})
</script>
