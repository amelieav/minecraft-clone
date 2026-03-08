import '@babylonjs/loaders/glTF'
import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  PointerEventTypes,
  Ray,
  Scene,
  SceneLoader,
  StandardMaterial,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core'
import { BLOCK, BLOCK_INFO, CAMERA_CONFIG, PLAYER_CONFIG, WORLD_SIZE } from './config'
import { VoxelWorld } from './VoxelWorld'

export async function createBabylonGame(canvas, hooks) {
  const engine = new Engine(canvas, true, { antialias: true })
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.56, 0.78, 0.98, 1)
  scene.collisionsEnabled = true
  scene.gravity = new Vector3(0, CAMERA_CONFIG.gravity, 0)

  const camera = new UniversalCamera('playerCamera', Vector3.Zero(), scene)
  camera.fov = CAMERA_CONFIG.fov
  camera.minZ = CAMERA_CONFIG.minZ
  camera.inertia = CAMERA_CONFIG.inertia
  camera.angularSensibility = CAMERA_CONFIG.angularSensibility
  camera.applyGravity = true
  camera.checkCollisions = true
  camera.ellipsoid = new Vector3(0.35, 0.9, 0.35)
  camera.keysUp = [87]
  camera.keysDown = [83]
  camera.keysLeft = [65]
  camera.keysRight = [68]
  camera.speed = PLAYER_CONFIG.walkSpeed
  camera.attachControl(canvas, true)

  new HemisphericLight('hemi', new Vector3(0.4, 1, 0.2), scene).intensity = 0.88
  const sun = new DirectionalLight('sun', new Vector3(-0.3, -1, -0.4), scene)
  sun.position = new Vector3(WORLD_SIZE * 0.8, WORLD_SIZE * 1.8, WORLD_SIZE * 0.8)
  sun.intensity = 0.75

  const world = new VoxelWorld(scene)
  world.buildAllMeshes()

  const findSpawnPoint = () => {
    const center = Math.floor(WORLD_SIZE / 2)
    let startX = center
    let startZ = center
    const isSpawnFriendly = (x, z) => {
      const top = world.getTopBlock(x, z)
      return top !== BLOCK.WOOD && top !== BLOCK.LEAF
    }
    if (!isSpawnFriendly(startX, startZ)) {
      let found = false
      for (let radius = 1; radius <= 8 && !found; radius += 1) {
        for (let dz = -radius; dz <= radius && !found; dz += 1) {
          for (let dx = -radius; dx <= radius && !found; dx += 1) {
            const x = center + dx
            const z = center + dz
            if (!world.isInsideXZ(x, z)) continue
            if (!isSpawnFriendly(x, z)) continue
            startX = x
            startZ = z
            found = true
          }
        }
      }
    }

    const groundY = world.getHeight(startX, startZ)
    return {
      position: new Vector3(startX + 0.5, groundY + PLAYER_CONFIG.eyeHeight + 0.2, startZ + 0.5),
      target: new Vector3(startX + 0.5, groundY + 0.5, startZ + 6),
    }
  }

  const spawnPlayer = () => {
    const spawn = findSpawnPoint()
    camera.position.copyFrom(spawn.position)
    camera.cameraDirection.set(0, 0, 0)
    camera.setTarget(spawn.target)
  }

  spawnPlayer()

  const selectedOverlay = MeshBuilder.CreateBox('selected_overlay', { size: 1.04 }, scene)
  selectedOverlay.isPickable = false
  selectedOverlay.checkCollisions = false
  selectedOverlay.setEnabled(false)
  const overlayMaterial = new StandardMaterial('selected_overlay_mat', scene)
  overlayMaterial.disableLighting = true
  overlayMaterial.emissiveColor = new Color3(1, 1, 1)
  overlayMaterial.alpha = 0.12
  selectedOverlay.material = overlayMaterial
  selectedOverlay.enableEdgesRendering()
  selectedOverlay.edgesWidth = 3
  selectedOverlay.edgesColor = new Color4(1, 1, 1, 0.9)

  let selectedMeta = null
  let selectedNormal = null
  let jumpQueued = false
  let sprint = false
  let smoothFps = 0

  const keyDown = (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      sprint = true
      e.preventDefault()
    }
    if (e.code === 'Space') {
      jumpQueued = true
      e.preventDefault()
    }
  }
  const keyUp = (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sprint = false
  }

  const requestPointerLock = () => {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock()
  }

  const isGrounded = () => {
    const ray = new Ray(camera.position, new Vector3(0, -1, 0), PLAYER_CONFIG.eyeHeight + 0.2)
    const hit = scene.pickWithRay(ray, (mesh) => Boolean(mesh.metadata?.voxel))
    return Boolean(hit?.hit)
  }

  const updateSelection = () => {
    const pick = scene.pick(
      Math.floor(engine.getRenderWidth() * 0.5),
      Math.floor(engine.getRenderHeight() * 0.5),
      (mesh) => Boolean(mesh.metadata?.voxel),
    )

    if (!pick?.hit || !pick.pickedMesh?.metadata?.voxel) {
      selectedMeta = null
      selectedNormal = null
      selectedOverlay.setEnabled(false)
      hooks.onSelection({ valid: false, blockName: 'Air' })
      return
    }

    selectedMeta = pick.pickedMesh.metadata
    selectedNormal = pick.getNormal(true) || null
    selectedOverlay.position.copyFrom(pick.pickedMesh.position)
    selectedOverlay.setEnabled(true)
    selectedOverlay.edgesColor = hooks.getBuildMode()
      ? new Color4(0.96, 0.76, 0.2, 0.95)
      : new Color4(1, 1, 1, 0.95)

    hooks.onSelection({
      valid: true,
      blockName: BLOCK_INFO[selectedMeta.blockId]?.name || 'Unknown',
      x: selectedMeta.x,
      y: selectedMeta.y,
      z: selectedMeta.z,
    })
  }

  const tryMine = () => {
    if (!selectedMeta) return
    if (!world.canInteract(camera.position, selectedMeta.x, selectedMeta.y, selectedMeta.z, PLAYER_CONFIG.interactDistance)) return
    const mined = world.mineBlock(selectedMeta.x, selectedMeta.y, selectedMeta.z)
    if (mined !== BLOCK.AIR) hooks.onMine(mined)
  }

  const tryPlace = () => {
    if (!selectedMeta) return
    const blockId = hooks.getActiveBlockId()
    if (!hooks.canPlace(blockId)) return
    if (!world.canInteract(camera.position, selectedMeta.x, selectedMeta.y, selectedMeta.z, PLAYER_CONFIG.interactDistance)) return

    let tx = selectedMeta.x
    let ty = selectedMeta.y
    let tz = selectedMeta.z

    if (!selectedNormal) {
      ty += 1
    } else {
      const nx = Math.abs(selectedNormal.x) > 0.5 ? Math.sign(selectedNormal.x) : 0
      const ny = Math.abs(selectedNormal.y) > 0.5 ? Math.sign(selectedNormal.y) : 0
      const nz = Math.abs(selectedNormal.z) > 0.5 ? Math.sign(selectedNormal.z) : 0
      tx += nx
      ty += ny
      tz += nz
    }

    if (!world.isInsideXZ(tx, tz)) return
    if (!world.placeBlock(tx, ty, tz, blockId)) return
    hooks.onPlace(blockId)
  }

  const pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) return

    const event = pointerInfo.event
    if (document.pointerLockElement !== canvas) {
      requestPointerLock()
      return
    }

    if (event.button === 0) {
      if (hooks.getBuildMode()) tryPlace()
      else tryMine()
    } else if (event.button === 2) {
      tryPlace()
    }
  })

  const beforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
    camera.speed = sprint ? PLAYER_CONFIG.sprintSpeed : PLAYER_CONFIG.walkSpeed

    if (jumpQueued && isGrounded()) {
      camera.cameraDirection.y += PLAYER_CONFIG.jumpImpulse
    }
    jumpQueued = false

    const cellX = Math.floor(camera.position.x)
    const cellZ = Math.floor(camera.position.z)
    const fellThroughWorld = camera.position.y < -10
    const leftMap = !world.isInsideXZ(cellX, cellZ)
    if (fellThroughWorld || leftMap) {
      world.resetWorld()
      selectedMeta = null
      selectedNormal = null
      selectedOverlay.setEnabled(false)
      spawnPlayer()
    }

    const fps = engine.getFps()
    smoothFps = smoothFps ? smoothFps * 0.9 + fps * 0.1 : fps

    hooks.onFrame({
      fps: smoothFps,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    })

    updateSelection()
  })

  const onResize = () => engine.resize()
  const onContextMenu = (e) => e.preventDefault()

  window.addEventListener('resize', onResize)
  document.addEventListener('keydown', keyDown)
  document.addEventListener('keyup', keyUp)
  canvas.addEventListener('click', requestPointerLock)
  canvas.addEventListener('contextmenu', onContextMenu)

  engine.runRenderLoop(() => {
    scene.render()
  })

  return {
    async loadModel(url) {
      return SceneLoader.ImportMeshAsync('', '', url, scene)
    },
    dispose() {
      window.removeEventListener('resize', onResize)
      document.removeEventListener('keydown', keyDown)
      document.removeEventListener('keyup', keyUp)
      canvas.removeEventListener('click', requestPointerLock)
      canvas.removeEventListener('contextmenu', onContextMenu)
      if (pointerObserver) scene.onPointerObservable.remove(pointerObserver)
      if (beforeRenderObserver) scene.onBeforeRenderObservable.remove(beforeRenderObserver)
      world.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}
