export const WORLD_SIZE = 40
export const BASE_TERRAIN_HEIGHT = 4

export const PLAYER_CONFIG = {
  eyeHeight: 1.65,
  walkSpeed: 0.4,
  sprintSpeed: 0.65,
  jumpImpulse: 0.36,
  interactDistance: 8,
}

export const CAMERA_CONFIG = {
  fov: 1.18,
  minZ: 0.1,
  inertia: 0,
  angularSensibility: 1800,
  gravity: -0.45,
}

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAF: 5,
  PLANK: 6,
}

export const BLOCK_INFO = {
  [BLOCK.GRASS]: { name: 'Grass', color: '#5aa336' },
  [BLOCK.DIRT]: { name: 'Dirt', color: '#8a5a2f' },
  [BLOCK.STONE]: { name: 'Stone', color: '#6f6f6f' },
  [BLOCK.WOOD]: { name: 'Log', color: '#8b5a2b' },
  [BLOCK.LEAF]: { name: 'Leaves', color: '#3f8f3a' },
  [BLOCK.PLANK]: { name: 'Planks', color: '#c49a5a' },
}
