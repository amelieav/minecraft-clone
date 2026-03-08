import { BASE_TERRAIN_HEIGHT, BLOCK, WORLD_SIZE } from './config'

function rand(seed) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function heightAt(x, z) {
  let hillHeight = 0
  for (let i = 0; i < 6; i += 1) {
    const cx = 4 + Math.floor(rand(i * 31.7 + 10) * (WORLD_SIZE - 8))
    const cz = 4 + Math.floor(rand(i * 54.1 + 20) * (WORLD_SIZE - 8))
    const radius = 3 + Math.floor(rand(i * 19.3 + 30) * 4)
    const maxRise = 2 + Math.floor(rand(i * 7.9 + 40) * 3)

    const dx = x - cx
    const dz = z - cz
    const dist = Math.hypot(dx, dz)
    if (dist >= radius) continue

    const t = 1 - dist / radius
    hillHeight += Math.floor(maxRise * t * t)
  }

  const roughness = hillHeight > 0 ? Math.floor(rand(x * 3.7 + z * 5.2 + 99) * 2) : 0
  return BASE_TERRAIN_HEIGHT + Math.max(0, hillHeight - roughness)
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`
}

function setBlock(blockMap, x, y, z, blockId, { replace = true } = {}) {
  if (x < 0 || z < 0 || x >= WORLD_SIZE || z >= WORLD_SIZE || y < 0) return
  const key = blockKey(x, y, z)
  if (!replace && blockMap.has(key)) return
  blockMap.set(key, { x, y, z, blockId })
}

function canPlaceTreeAt(heightMap, x, z) {
  if (x < 2 || z < 2 || x >= WORLD_SIZE - 2 || z >= WORLD_SIZE - 2) return false

  let minH = Infinity
  let maxH = -Infinity
  for (let zz = -2; zz <= 2; zz += 1) {
    for (let xx = -2; xx <= 2; xx += 1) {
      const h = heightMap[z + zz][x + xx]
      if (h < minH) minH = h
      if (h > maxH) maxH = h
    }
  }
  return maxH - minH <= 1
}

function findTreeSpot(heightMap, startX, startZ) {
  if (canPlaceTreeAt(heightMap, startX, startZ)) return { x: startX, z: startZ }

  for (let radius = 1; radius <= Math.floor(WORLD_SIZE / 2); radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = startX + dx
        const z = startZ + dz
        if (x < 2 || z < 2 || x >= WORLD_SIZE - 2 || z >= WORLD_SIZE - 2) continue
        if (!canPlaceTreeAt(heightMap, x, z)) continue
        return { x, z }
      }
    }
  }

  return { x: startX, z: startZ }
}

function placeTree(blockMap, heightMap, x, z) {
  const groundY = heightMap[z][x]
  const trunkHeight = 5
  const trunkTopY = groundY + trunkHeight - 1

  for (let y = groundY; y < groundY + trunkHeight; y += 1) {
    setBlock(blockMap, x, y, z, BLOCK.WOOD)
  }

  const addLeafLayer = (centerY, radius, manhattanMax) => {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const dist = Math.abs(dx) + Math.abs(dz)
        if (dist > manhattanMax) continue
        if (dx === 0 && dz === 0) continue
        setBlock(blockMap, x + dx, centerY, z + dz, BLOCK.LEAF, { replace: false })
      }
    }
  }

  addLeafLayer(trunkTopY - 1, 2, 3)
  addLeafLayer(trunkTopY, 2, 2)
  addLeafLayer(trunkTopY + 1, 1, 2)
  setBlock(blockMap, x, trunkTopY + 2, z, BLOCK.LEAF, { replace: false })
  setBlock(blockMap, x + 1, trunkTopY + 1, z, BLOCK.LEAF, { replace: false })
  setBlock(blockMap, x - 1, trunkTopY + 1, z, BLOCK.LEAF, { replace: false })
  setBlock(blockMap, x, trunkTopY + 1, z + 1, BLOCK.LEAF, { replace: false })
  setBlock(blockMap, x, trunkTopY + 1, z - 1, BLOCK.LEAF, { replace: false })
}

export function generateWorldData() {
  const heightMap = []
  const blockMap = new Map()

  for (let z = 0; z < WORLD_SIZE; z += 1) {
    heightMap[z] = []
    for (let x = 0; x < WORLD_SIZE; x += 1) {
      const h = heightAt(x, z)
      heightMap[z][x] = h
      for (let y = 0; y < h; y += 1) {
        if (y === h - 1) setBlock(blockMap, x, y, z, BLOCK.GRASS)
        else if (y >= h - 3) setBlock(blockMap, x, y, z, BLOCK.DIRT)
        else setBlock(blockMap, x, y, z, BLOCK.STONE)
      }
    }
  }

  const center = Math.floor(WORLD_SIZE / 2)
  const spotA = findTreeSpot(heightMap, Math.max(3, center - 6), Math.max(3, center - 4))
  placeTree(blockMap, heightMap, spotA.x, spotA.z)

  const spotB = findTreeSpot(heightMap, Math.min(WORLD_SIZE - 4, center + 7), Math.min(WORLD_SIZE - 4, center + 5))
  placeTree(blockMap, heightMap, spotB.x, spotB.z)

  return Array.from(blockMap.values())
}
