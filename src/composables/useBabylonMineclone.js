import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { BLOCK, BLOCK_INFO } from '../game/config'
import { createBabylonGame } from '../game/createBabylonGame'

export function useBabylonMineclone() {
  const perf = reactive({ fps: 0 })
  const player = reactive({ x: 0, y: 0, z: 0 })
  const selection = reactive({ valid: false, blockName: 'Air' })
  const startError = ref('')

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

  let game = null

  const activeBlockId = computed(() => hotbar[activeSlot.value].block)

  const selectedBlockName = computed(() => selection.blockName)

  function canPlace(blockId) {
    if (blockId === BLOCK.DIRT) return inventory.dirt > 0
    if (blockId === BLOCK.STONE) return inventory.stone > 0
    if (blockId === BLOCK.GRASS) return inventory.grass > 0
    if (blockId === BLOCK.PLANK) return inventory.planks > 0
    if (blockId === BLOCK.WOOD) return inventory.logs > 0
    return false
  }

  function onMined(blockId) {
    if (blockId === BLOCK.WOOD) inventory.logs += 1
    if (blockId === BLOCK.DIRT) inventory.dirt += 1
    if (blockId === BLOCK.STONE) inventory.stone += 1
    if (blockId === BLOCK.GRASS) inventory.grass += 1
    if (blockId === BLOCK.LEAF) inventory.sticks += 1
  }

  function onPlaced(blockId) {
    if (blockId === BLOCK.DIRT) inventory.dirt -= 1
    if (blockId === BLOCK.STONE) inventory.stone -= 1
    if (blockId === BLOCK.GRASS) inventory.grass -= 1
    if (blockId === BLOCK.PLANK) inventory.planks -= 1
    if (blockId === BLOCK.WOOD) inventory.logs -= 1
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

  const onUiKeyDown = (e) => {
    if (e.code === 'KeyQ') {
      buildMode.value = !buildMode.value
      e.preventDefault()
    }
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.replace('Digit', ''))
      if (n >= 1 && n <= hotbar.length) {
        activeSlot.value = n - 1
      }
    }
  }

  async function start(canvas) {
    startError.value = ''
    try {
      game = await createBabylonGame(canvas, {
        getBuildMode: () => buildMode.value,
        getActiveBlockId: () => activeBlockId.value,
        canPlace,
        onMine: onMined,
        onPlace: onPlaced,
        onSelection: (next) => {
          selection.valid = next.valid
          selection.blockName = next.blockName
        },
        onFrame: ({ fps, x, y, z }) => {
          perf.fps = fps
          player.x = x
          player.y = y
          player.z = z
        },
      })

      document.addEventListener('keydown', onUiKeyDown)
    } catch (err) {
      startError.value = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  function stop() {
    document.removeEventListener('keydown', onUiKeyDown)
    if (game) {
      game.dispose()
      game = null
    }
  }

  onBeforeUnmount(() => stop())

  return {
    perf,
    player,
    inventory,
    hotbar,
    inventoryList,
    buildMode,
    activeSlot,
    selectedBlockName,
    startError,
    blockInfo: BLOCK_INFO,
    start,
    stop,
    craftPlanks,
    craftStick,
  }
}
