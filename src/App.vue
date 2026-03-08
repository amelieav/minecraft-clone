<template>
  <div class="app">
    <header class="topbar">
      <div class="title">Mineclone - First Person</div>
      <div class="stats">
        <div>Pos: {{ player.x.toFixed(1) }}, {{ player.y.toFixed(1) }}, {{ player.z.toFixed(1) }}</div>
        <div>FPS: {{ perf.fps.toFixed(0) }}</div>
        <div>Selected: {{ selectedBlockName }}</div>
        <div>Mode: {{ buildMode ? 'Place' : 'Mine' }}</div>
      </div>
    </header>

    <div class="game">
      <canvas ref="canvasRef" class="game-canvas" width="960" height="640"></canvas>
      <div class="hud">
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
            <div>WASD: move / strafe</div>
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
import { onMounted, onBeforeUnmount, reactive, ref, computed } from 'vue'

const canvasRef = ref(null)
const ctxRef = ref(null)
const cleanup = ref(() => {})

const CHUNK_SIZE = 8
const CHUNKS = 5
const WORLD_SIZE = CHUNK_SIZE * CHUNKS

const EYE_HEIGHT = 1.65
const FOV_MIN = Math.PI / 3.2
const FOV_MAX = Math.PI / 1.95
const VIEW_DISTANCE_MIN = 20
const VIEW_DISTANCE_MAX = 42
const BASE_RENDER_SCALE = 0.52
const SHADE_STEPS = 48

const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAF: 5,
  PLANK: 6,
}

const BLOCK_INFO = {
  [BLOCK.GRASS]: { name: 'Grass', color: '#5aa336' },
  [BLOCK.DIRT]: { name: 'Dirt', color: '#8a5a2f' },
  [BLOCK.STONE]: { name: 'Stone', color: '#6f6f6f' },
  [BLOCK.WOOD]: { name: 'Log', color: '#8b5a2b' },
  [BLOCK.LEAF]: { name: 'Leaves', color: '#3f8f3a' },
  [BLOCK.PLANK]: { name: 'Planks', color: '#c49a5a' },
}

const player = reactive({
  x: WORLD_SIZE / 2,
  y: WORLD_SIZE / 2,
  z: 0,
  yaw: -Math.PI / 2,
  pitch: -0.15,
})

const move = reactive({
  forward: false,
  back: false,
  left: false,
  right: false,
  sprint: false,
  jumpQueued: false,
})
const perf = reactive({ fps: 0 })
const camera = reactive({
  zoom: 0.34,
  fov: Math.PI / 2.8,
  viewDistance: 28,
})
const render = reactive({
  scale: BASE_RENDER_SCALE,
  rayStride: 3,
})
const physics = reactive({
  velZ: 0,
  grounded: true,
})

const buildMode = ref(false)
const activeSlot = ref(0)

const inventory = reactive({
  logs: 0,
  planks: 0,
  sticks: 0,
  dirt: 10,
  stone: 6,
  grass: 6,
})

const hotbar = reactive([
  { name: 'Dirt', block: BLOCK.DIRT, count: computed(() => inventory.dirt) },
  { name: 'Stone', block: BLOCK.STONE, count: computed(() => inventory.stone) },
  { name: 'Grass', block: BLOCK.GRASS, count: computed(() => inventory.grass) },
  { name: 'Planks', block: BLOCK.PLANK, count: computed(() => inventory.planks) },
  { name: 'Log', block: BLOCK.WOOD, count: computed(() => inventory.logs) },
])

const inventoryList = computed(() => [
  { name: 'Logs', count: inventory.logs },
  { name: 'Planks', count: inventory.planks },
  { name: 'Sticks', count: inventory.sticks },
  { name: 'Dirt', count: inventory.dirt },
  { name: 'Stone', count: inventory.stone },
  { name: 'Grass', count: inventory.grass },
])

const world = []
const heights = []

const selected = reactive({ x: 0, y: 0, valid: false })

const selectedBlockName = computed(() => {
  if (!selected.valid) return 'Air'
  const h = heights[selected.y]?.[selected.x] || 0
  if (h <= 0) return 'Air'
  const b = world[selected.y][selected.x][h - 1]
  return BLOCK_INFO[b]?.name || 'Unknown'
})

function rand(seed) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function heightAt(x, y) {
  const base = 4
  let hillHeight = 0

  // Sparse hills: most terrain stays flat.
  for (let i = 0; i < 6; i += 1) {
    const cx = 4 + Math.floor(rand(i * 31.7 + 10) * (WORLD_SIZE - 8))
    const cy = 4 + Math.floor(rand(i * 54.1 + 20) * (WORLD_SIZE - 8))
    const radius = 3 + Math.floor(rand(i * 19.3 + 30) * 4)
    const maxRise = 2 + Math.floor(rand(i * 7.9 + 40) * 3)

    const dx = x - cx
    const dy = y - cy
    const dist = Math.hypot(dx, dy)
    if (dist >= radius) continue

    const t = 1 - dist / radius
    hillHeight += Math.floor(maxRise * t * t)
  }

  // Light erosion only near hills so they look a bit damaged/irregular.
  const roughness = hillHeight > 0 ? Math.floor(rand(x * 3.7 + y * 5.2 + 99) * 2) : 0
  return base + Math.max(0, hillHeight - roughness)
}

function generateWorld() {
  for (let y = 0; y < WORLD_SIZE; y += 1) {
    world[y] = []
    heights[y] = []
    for (let x = 0; x < WORLD_SIZE; x += 1) {
      const h = heightAt(x, y)
      heights[y][x] = h
      const column = []
      for (let z = 0; z < h; z += 1) {
        if (z === h - 1) column.push(BLOCK.GRASS)
        else if (z >= h - 3) column.push(BLOCK.DIRT)
        else column.push(BLOCK.STONE)
      }
      world[y][x] = column
    }
  }

  const tx = Math.floor(WORLD_SIZE / 2)
  const ty = Math.floor(WORLD_SIZE / 2)
  placeTree(tx, ty)
}

function placeTree(x, y) {
  const base = heights[y][x]
  for (let z = 0; z < 4; z += 1) {
    world[y][x][base + z] = BLOCK.WOOD
  }
  heights[y][x] = base + 4

  for (let yy = -2; yy <= 2; yy += 1) {
    for (let xx = -2; xx <= 2; xx += 1) {
      const ax = x + xx
      const ay = y + yy
      if (ax < 0 || ay < 0 || ax >= WORLD_SIZE || ay >= WORLD_SIZE) continue
      const dist = Math.abs(xx) + Math.abs(yy)
      if (dist <= 3) {
        const leafBase = heights[ay][ax]
        world[ay][ax][leafBase] = BLOCK.LEAF
        heights[ay][ax] = leafBase + 1
      }
    }
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function topBlockAt(x, y) {
  if (x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE) return BLOCK.AIR
  const h = heights[y][x]
  if (h <= 0) return BLOCK.AIR
  return world[y][x][h - 1]
}

function blockHexToRgb(hex) {
  const val = hex.replace('#', '')
  const num = Number.parseInt(val, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

const BLOCK_RGB = {}
for (const [id, info] of Object.entries(BLOCK_INFO)) {
  BLOCK_RGB[id] = blockHexToRgb(info.color)
}

const shadeLut = {}
for (const id of Object.keys(BLOCK_INFO)) {
  const rgb = BLOCK_RGB[id]
  const shades = []
  for (let i = 0; i < SHADE_STEPS; i += 1) {
    const t = i / (SHADE_STEPS - 1)
    const shade = clamp(1 - t * 0.78, 0.28, 1)
    const fogMix = t * 0.5
    const r = Math.round(rgb.r * shade + 158 * fogMix)
    const g = Math.round(rgb.g * shade + 192 * fogMix)
    const b = Math.round(rgb.b * shade + 225 * fogMix)
    shades.push(`rgb(${r}, ${g}, ${b})`)
  }
  shadeLut[id] = shades
}

function shadeBlock(block, distance, maxDistance) {
  const idx = clamp(Math.floor((distance / maxDistance) * (SHADE_STEPS - 1)), 0, SHADE_STEPS - 1)
  return (shadeLut[block] || shadeLut[BLOCK.STONE])[idx]
}

function terrainHeightAt(x, y) {
  const px = clamp(Math.floor(x), 0, WORLD_SIZE - 1)
  const py = clamp(Math.floor(y), 0, WORLD_SIZE - 1)
  return heights[py][px]
}

function syncPlayerHeight() {
  const px = clamp(Math.floor(player.x), 0, WORLD_SIZE - 1)
  const py = clamp(Math.floor(player.y), 0, WORLD_SIZE - 1)
  const floorZ = heights[py][px] + EYE_HEIGHT
  if (player.z < floorZ) {
    player.z = floorZ
    physics.velZ = 0
    physics.grounded = true
  }
}

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
  canvas.width = Math.max(280, Math.floor(rect.width * dpr * render.scale))
  canvas.height = Math.max(190, Math.floor(rect.width * 0.66 * dpr * render.scale))
}

function castCenterRay() {
  selected.valid = false

  const yaw = player.yaw
  const pitch = player.pitch
  const dx = Math.cos(yaw) * Math.cos(pitch)
  const dy = Math.sin(yaw) * Math.cos(pitch)
  const dz = Math.sin(pitch)

  for (let t = 0.6; t <= 6.5; t += 0.06) {
    const rx = player.x + dx * t
    const ry = player.y + dy * t
    const rz = player.z + dz * t
    if (rx < 0 || ry < 0 || rx >= WORLD_SIZE || ry >= WORLD_SIZE || rz < 0) break

    const ix = Math.floor(rx)
    const iy = Math.floor(ry)
    if (rz < heights[iy][ix]) {
      selected.x = ix
      selected.y = iy
      selected.valid = true
      return
    }
  }
}

function drawCrosshair(ctx) {
  const cx = ctx.canvas.width / 2
  const cy = ctx.canvas.height / 2
  ctx.strokeStyle = buildMode.value ? '#f4c33d' : '#ffffff'
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.moveTo(cx - 10, cy)
  ctx.lineTo(cx - 2, cy)
  ctx.moveTo(cx + 2, cy)
  ctx.lineTo(cx + 10, cy)
  ctx.moveTo(cx, cy - 10)
  ctx.lineTo(cx, cy - 2)
  ctx.moveTo(cx, cy + 2)
  ctx.lineTo(cx, cy + 10)
  ctx.stroke()
}

function drawScene() {
  const ctx = ctxRef.value
  if (!ctx) return

  const w = ctx.canvas.width
  const h = ctx.canvas.height
  const horizon = h * 0.5 + player.pitch * h * 0.38

  ctx.fillStyle = '#86c5ff'
  ctx.fillRect(0, 0, w, horizon)
  ctx.fillStyle = '#4e7f38'
  ctx.fillRect(0, horizon, w, h - horizon)

  const projScale = h * 0.95
  const rayStride = render.rayStride
  const cosHalfFov = Math.cos(camera.fov * 0.5)
  const maxDdaSteps = Math.ceil(camera.viewDistance * 2.2)

  for (let sx = 0; sx < w; sx += rayStride) {
    const rayAngle = player.yaw + ((sx / w) - 0.5) * camera.fov
    const dirX = Math.cos(rayAngle)
    const dirY = Math.sin(rayAngle)

    let columnTop = h
    let prevHeight = -1
    let mapX = Math.floor(player.x)
    let mapY = Math.floor(player.y)
    const deltaDistX = dirX === 0 ? 1e30 : Math.abs(1 / dirX)
    const deltaDistY = dirY === 0 ? 1e30 : Math.abs(1 / dirY)
    const stepX = dirX < 0 ? -1 : 1
    const stepY = dirY < 0 ? -1 : 1

    let sideDistX = dirX < 0 ? (player.x - mapX) * deltaDistX : (mapX + 1 - player.x) * deltaDistX
    let sideDistY = dirY < 0 ? (player.y - mapY) * deltaDistY : (mapY + 1 - player.y) * deltaDistY
    let dist = 0

    for (let steps = 0; steps < maxDdaSteps; steps += 1) {
      if (sideDistX < sideDistY) {
        dist = sideDistX
        sideDistX += deltaDistX
        mapX += stepX
      } else {
        dist = sideDistY
        sideDistY += deltaDistY
        mapY += stepY
      }

      if (dist > camera.viewDistance) break
      if (mapX < 0 || mapY < 0 || mapX >= WORLD_SIZE || mapY >= WORLD_SIZE) break

      const correctedDist = Math.max(0.35, dist * Math.cos(rayAngle - player.yaw) / cosHalfFov)
      const terrainTop = heights[mapY][mapX]
      if (terrainTop <= 0) continue

      const topY = horizon - ((terrainTop - player.z) / correctedDist) * projScale
      const bottomY = horizon - ((0 - player.z) / correctedDist) * projScale

      const drawTop = Math.max(0, Math.floor(topY))
      const drawBottom = Math.min(columnTop, Math.floor(bottomY))

      if (drawBottom > drawTop) {
        const block = topBlockAt(mapX, mapY)
        ctx.fillStyle = shadeBlock(block, dist, camera.viewDistance)
        ctx.fillRect(sx, drawTop, rayStride + 1, drawBottom - drawTop)

        // Top edge + terrain discontinuities improve block separation.
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.fillRect(sx, drawTop, rayStride + 1, 1)
        if (prevHeight !== -1 && prevHeight !== terrainTop) {
          const edgeAlpha = clamp(0.14 + Math.abs(prevHeight - terrainTop) * 0.06, 0.14, 0.42)
          ctx.fillStyle = `rgba(0,0,0,${edgeAlpha})`
          ctx.fillRect(sx, drawTop, 1, drawBottom - drawTop)
        }

        prevHeight = terrainTop
        columnTop = drawTop
        if (columnTop <= 0) break
      }
    }
  }

  castCenterRay()
  drawCrosshair(ctx)
}

function withinReach(x, y) {
  const dx = player.x - x - 0.5
  const dy = player.y - y - 0.5
  return Math.hypot(dx, dy) <= 4.75
}

function mineBlock(x, y) {
  if (!withinReach(x, y)) return
  const h = heights[y][x]
  if (h <= 0) return

  const block = world[y][x][h - 1]
  world[y][x].pop()
  heights[y][x] = h - 1

  if (block === BLOCK.WOOD) inventory.logs += 1
  if (block === BLOCK.DIRT) inventory.dirt += 1
  if (block === BLOCK.STONE) inventory.stone += 1
  if (block === BLOCK.GRASS) inventory.grass += 1
  if (block === BLOCK.LEAF) inventory.sticks += 1

  syncPlayerHeight()
}

function placeBlock(x, y) {
  if (!withinReach(x, y)) return

  const slot = hotbar[activeSlot.value]
  const block = slot.block

  if (block === BLOCK.DIRT && inventory.dirt <= 0) return
  if (block === BLOCK.STONE && inventory.stone <= 0) return
  if (block === BLOCK.GRASS && inventory.grass <= 0) return
  if (block === BLOCK.PLANK && inventory.planks <= 0) return
  if (block === BLOCK.WOOD && inventory.logs <= 0) return

  world[y][x].push(block)
  heights[y][x] += 1

  if (block === BLOCK.DIRT) inventory.dirt -= 1
  if (block === BLOCK.STONE) inventory.stone -= 1
  if (block === BLOCK.GRASS) inventory.grass -= 1
  if (block === BLOCK.PLANK) inventory.planks -= 1
  if (block === BLOCK.WOOD) inventory.logs -= 1

  syncPlayerHeight()
}

function craftPlanks() {
  if (inventory.logs < 1) return
  inventory.logs -= 1
  inventory.planks += 4
}

function craftStick() {
  if (inventory.planks < 2) return
  inventory.planks -= 2
  inventory.sticks += 4
}

function update(dt) {
  const forwardSpeed = move.sprint ? 4.6 : 3.2
  const strafeSpeed = move.sprint ? 3.9 : 2.8
  const gravity = -22
  const jumpVelocity = 8.5

  const dirX = Math.cos(player.yaw)
  const dirY = Math.sin(player.yaw)
  const rightX = Math.cos(player.yaw + Math.PI / 2)
  const rightY = Math.sin(player.yaw + Math.PI / 2)

  let velX = 0
  let velY = 0

  if (move.forward) {
    velX += dirX * forwardSpeed
    velY += dirY * forwardSpeed
  }
  if (move.back) {
    velX -= dirX * forwardSpeed
    velY -= dirY * forwardSpeed
  }
  if (move.left) {
    velX -= rightX * strafeSpeed
    velY -= rightY * strafeSpeed
  }
  if (move.right) {
    velX += rightX * strafeSpeed
    velY += rightY * strafeSpeed
  }

  player.x = clamp(player.x + velX * dt, 0.05, WORLD_SIZE - 0.05)
  player.y = clamp(player.y + velY * dt, 0.05, WORLD_SIZE - 0.05)

  const floorZ = terrainHeightAt(player.x, player.y) + EYE_HEIGHT
  if (physics.grounded && move.jumpQueued) {
    physics.velZ = jumpVelocity
    physics.grounded = false
  }
  move.jumpQueued = false

  if (!physics.grounded) {
    physics.velZ += gravity * dt
    player.z += physics.velZ * dt
  }

  if (player.z <= floorZ) {
    player.z = floorZ
    physics.velZ = 0
    physics.grounded = true
  } else {
    physics.grounded = false
  }
}

let raf = 0
let last = 0
let frameCounter = 0
function loop(ts) {
  if (!last) last = ts
  const dt = Math.min(0.033, (ts - last) / 1000)
  last = ts

  update(dt)
  drawScene()

  const instFps = 1 / Math.max(dt, 0.001)
  perf.fps = perf.fps ? perf.fps * 0.9 + instFps * 0.1 : instFps
  frameCounter += 1

  if (frameCounter % 45 === 0) {
    if (perf.fps < 48) {
      render.scale = clamp(render.scale - 0.03, 0.4, BASE_RENDER_SCALE)
      render.rayStride = 4
      resizeCanvas()
    } else if (perf.fps > 57) {
      render.scale = clamp(render.scale + 0.02, 0.4, BASE_RENDER_SCALE)
      render.rayStride = 3
      resizeCanvas()
    }
  }

  raf = requestAnimationFrame(loop)
}

function onKey(e, state) {
  if (e.code === 'Space') e.preventDefault()
  if (e.code === 'KeyW') move.forward = state
  if (e.code === 'KeyS') move.back = state
  if (e.code === 'KeyA') move.left = state
  if (e.code === 'KeyD') move.right = state
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') move.sprint = state
  if (state && e.code === 'Space') move.jumpQueued = true

  if (state && e.code === 'KeyQ') buildMode.value = !buildMode.value

  if (state && e.code.startsWith('Digit')) {
    const n = Number(e.code.replace('Digit', ''))
    if (n >= 1 && n <= hotbar.length) activeSlot.value = n - 1
  }
}

function onMouseDown(e) {
  const canvas = canvasRef.value
  if (!canvas) return

  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock()
    return
  }

  if (!selected.valid) return

  if (e.button === 2 || (e.button === 0 && buildMode.value)) {
    placeBlock(selected.x, selected.y)
  } else if (e.button === 0) {
    mineBlock(selected.x, selected.y)
  }
}

function onWheel(e) {
  e.preventDefault()
  camera.zoom = clamp(camera.zoom + Math.sign(e.deltaY) * 0.06, 0, 1)
  camera.fov = FOV_MIN + (FOV_MAX - FOV_MIN) * camera.zoom
  camera.viewDistance = VIEW_DISTANCE_MIN + (VIEW_DISTANCE_MAX - VIEW_DISTANCE_MIN) * camera.zoom
}

onMounted(() => {
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  ctx.imageSmoothingEnabled = false
  ctxRef.value = ctx

  generateWorld()
  syncPlayerHeight()
  resizeCanvas()
  drawScene()

  const handleResize = () => resizeCanvas()
  const handleMouseMove = (e) => {
    if (document.pointerLockElement !== canvas) return
    player.yaw += e.movementX * 0.0028
    player.pitch = clamp(player.pitch - e.movementY * 0.0022, -0.85, 0.45)
  }

  const keyDown = (e) => onKey(e, true)
  const keyUp = (e) => onKey(e, false)

  canvas.addEventListener('mousedown', onMouseDown)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', keyDown)
  window.addEventListener('keyup', keyUp)

  raf = requestAnimationFrame(loop)

  cleanup.value = () => {
    cancelAnimationFrame(raf)
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('wheel', onWheel)
    document.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('keyup', keyUp)
  }
})

onBeforeUnmount(() => {
  cleanup.value()
})
</script>
