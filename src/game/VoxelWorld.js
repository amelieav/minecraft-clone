import { Color3, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core'
import { BLOCK, BLOCK_INFO, WORLD_SIZE } from './config'
import { generateWorldData } from './terrain'

function parseHexColor(hex) {
  return Color3.FromHexString(hex)
}

function blockKey(x, y, z) {
  return `${x},${y},${z}`
}

function columnKey(x, z) {
  return `${x},${z}`
}

export class VoxelWorld {
  constructor(scene) {
    this.scene = scene
    this.blocks = new Map()
    this.columnTopY = new Map()
    this.meshes = new Map()
    this.materials = new Map()
    this._initMaterials()
    this._loadGeneratedWorld()
  }

  dispose() {
    for (const mesh of this.meshes.values()) {
      mesh.dispose()
    }
    this.meshes.clear()
    for (const mat of this.materials.values()) {
      mat.dispose()
    }
    this.materials.clear()
    this.blocks.clear()
    this.columnTopY.clear()
  }

  _initMaterials() {
    for (const [id, info] of Object.entries(BLOCK_INFO)) {
      const mat = new StandardMaterial(`block_${id}`, this.scene)
      mat.diffuseColor = parseHexColor(info.color)
      mat.specularColor = new Color3(0.04, 0.04, 0.04)
      mat.ambientColor = mat.diffuseColor.scale(0.25)
      this.materials.set(Number(id), mat)
    }
  }

  _loadGeneratedWorld() {
    const generated = generateWorldData()
    this.blocks.clear()
    this.columnTopY.clear()
    for (const { x, y, z, blockId } of generated) {
      if (blockId === BLOCK.AIR) continue
      this._setBlockData(x, y, z, blockId)
    }
  }

  _setBlockData(x, y, z, blockId) {
    const bKey = blockKey(x, y, z)
    this.blocks.set(bKey, blockId)

    const cKey = columnKey(x, z)
    const top = this.columnTopY.get(cKey)
    if (top === undefined || y > top) {
      this.columnTopY.set(cKey, y)
    }
  }

  _removeBlockData(x, y, z) {
    const bKey = blockKey(x, y, z)
    if (!this.blocks.delete(bKey)) return

    const cKey = columnKey(x, z)
    const top = this.columnTopY.get(cKey)
    if (top !== y) return

    let nextTop = -1
    for (let yy = y - 1; yy >= 0; yy -= 1) {
      if (this.blocks.has(blockKey(x, yy, z))) {
        nextTop = yy
        break
      }
    }
    if (nextTop >= 0) this.columnTopY.set(cKey, nextTop)
    else this.columnTopY.delete(cKey)
  }

  buildAllMeshes() {
    for (const [key, blockId] of this.blocks.entries()) {
      const [x, y, z] = key.split(',').map(Number)
      this._spawnBlockMesh(x, y, z, blockId)
    }
  }

  resetWorld() {
    for (const mesh of this.meshes.values()) {
      mesh.dispose()
    }
    this.meshes.clear()
    this._loadGeneratedWorld()
    this.buildAllMeshes()
  }

  isInsideXZ(x, z) {
    return x >= 0 && z >= 0 && x < WORLD_SIZE && z < WORLD_SIZE
  }

  getHeight(x, z) {
    if (!this.isInsideXZ(x, z)) return 0
    const top = this.columnTopY.get(columnKey(x, z))
    return top === undefined ? 0 : top + 1
  }

  getBlock(x, y, z) {
    if (!this.isInsideXZ(x, z) || y < 0) return BLOCK.AIR
    return this.blocks.get(blockKey(x, y, z)) ?? BLOCK.AIR
  }

  getTopBlock(x, z) {
    const h = this.getHeight(x, z)
    if (h <= 0) return BLOCK.AIR
    return this.getBlock(x, h - 1, z)
  }

  mineBlock(x, y, z) {
    const mined = this.getBlock(x, y, z)
    if (mined === BLOCK.AIR) return BLOCK.AIR

    this._removeBlockData(x, y, z)
    const minedMesh = this.meshes.get(blockKey(x, y, z))
    if (minedMesh) {
      minedMesh.dispose()
      this.meshes.delete(blockKey(x, y, z))
    }

    return mined
  }

  placeBlock(x, y, z, blockId) {
    if (!this.isInsideXZ(x, z) || y < 0) return false
    if (this.getBlock(x, y, z) !== BLOCK.AIR) return false

    this._setBlockData(x, y, z, blockId)
    this._spawnBlockMesh(x, y, z, blockId)
    return true
  }

  canInteract(fromPosition, x, y, z, maxDistance) {
    const center = new Vector3(x + 0.5, y + 0.5, z + 0.5)
    return Vector3.Distance(fromPosition, center) <= maxDistance
  }

  _spawnBlockMesh(x, y, z, blockId) {
    const key = blockKey(x, y, z)
    const existing = this.meshes.get(key)
    if (existing) {
      existing.dispose()
      this.meshes.delete(key)
    }

    const mesh = MeshBuilder.CreateBox(`block_${x}_${y}_${z}`, { size: 1 }, this.scene)
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5)
    mesh.material = this.materials.get(blockId) || this.materials.get(BLOCK.STONE)
    mesh.checkCollisions = true
    mesh.isPickable = true
    mesh.metadata = { voxel: true, x, y, z, blockId }
    this.meshes.set(key, mesh)
  }
}
