/**
 * The player's house as drawn by the HarooLife engine: dimensions, furniture placement,
 * obstacles and interaction points ported from the « Une vie à Lomé » prototype
 * (`scene.js` → `buildInterior('home')`). Pure data: the renderer builds the meshes, the game
 * applies the effects.
 *
 * Every interaction point names the Saas prop it stands for (`propId`, an id of
 * `layoutFor('house')`): the effect is the one of the existing domain (`lome-life-engine`),
 * never a second economy. Only the exit is engine-side (leaving the building).
 */
import type { Bounds, Obstacle, Point } from './pathfind'

export interface FurniturePlacement {
  /** File name (without extension) under HAROO_ASSETS.furniture. */
  model: string
  /** Full URL when the model comes from another kit. */
  url?: string
  x: number
  z: number
  /** Uniform scale of the model. */
  scale: number
  /** Yaw in radians. */
  rotation?: number
}

export interface Hotspot {
  /** Stable id (tests and HUD). */
  id: string
  /** The Saas prop whose action runs on arrival, or 'exit' to leave the building. */
  propId: string | 'exit'
  /** Where the player stands to act. */
  at: Point
  /** What the player faces once arrived. */
  faces: Point
  /** Marker icon and accessible label. */
  icon: string
  label: string
  /** Height of the marker above the floor. */
  markerY: number
  /** No marker on screen: the point is only used by the game (a seat for meals). */
  hidden?: boolean
}

export interface Rug {
  x: number
  z: number
  w: number
  d: number
  color: string
}

export interface HouseScene {
  /** Floor extent (the room is 12 × 10, the walkable area a little less). */
  bounds: Bounds
  spawn: Point
  /** Heading on spawn (radians, 0 = facing +Z). */
  spawnHeading: number
  furniture: FurniturePlacement[]
  obstacles: Obstacle[]
  hotspots: Hotspot[]
  rugs: Rug[]
  plants: { x: number; z: number; scale: number }[]
  /** Door on the back wall (where the exit marker stands). */
  door: Point
  palette: {
    background: string
    ground: string
    lawn: string
    plinth: string
    floor: string
    tileA: string
    tileB: string
    wall: string
    trim: string
  }
}

export const HOUSE_SCENE: HouseScene = {
  bounds: { minX: -5.7, maxX: 5.7, minZ: -4.7, maxZ: 4.7 },
  spawn: { x: 1.25, z: 2.9 },
  spawnHeading: 0.4,
  furniture: [
    { model: 'bedDouble', x: 3.4, z: -2.05, scale: 2.2 },
    { model: 'kitchenFridge', x: -5, z: -4.3, scale: 2.3 },
    { model: 'kitchenSink', x: -3.7, z: -4.35, scale: 2.2 },
    { model: 'kitchenStove', x: -2.5, z: -4.35, scale: 2.2 },
    { model: 'loungeSofa', x: -0.9, z: 0.8, scale: 2.6, rotation: Math.PI },
    { model: 'tableCoffee', x: -0.9, z: 2.45, scale: 2.4 },
    { model: 'desk', x: -4.9, z: 0.7, scale: 2.4, rotation: Math.PI / 2 },
    { model: 'bookcaseOpen', x: 0.2, z: -4.5, scale: 2.4 },
    { model: 'chair', x: 3.3, z: 0.8, scale: 2.4 },
    { model: 'lampRoundFloor', x: 1.1, z: 0.2, scale: 2 },
    { model: 'showerRound', x: -5, z: 3.7, scale: 2.2 },
    { model: 'toiletSquare', x: -4.9, z: 2.25, scale: 2 },
    // The dining corner by the kitchen: meals are eaten at the table, facing the room.
    {
      model: 'tableDining',
      url: '/haroolife/vendor/kenney-3d/furniture-kit/table.glb',
      x: -2.2,
      z: -1.35,
      scale: 2.2,
    },
    { model: 'chair', x: -2.7, z: -2.2, scale: 2.4 },
    { model: 'chair', x: -1.7, z: -2.2, scale: 2.4 },
  ],
  obstacles: [
    { x: 3.4, z: -2.05, w: 2.1, d: 2.45 },
    { x: -4.9, z: -4.2, w: 1.3, d: 1.3 },
    { x: -3.1, z: -4.3, w: 2.5, d: 1.1 },
    { x: -0.9, z: 0.8, w: 2.6, d: 1 },
    { x: -0.9, z: 2.45, w: 1.7, d: 1 },
    { x: -4.9, z: 0.7, w: 1.1, d: 2.1 },
    { x: 0.2, z: -4.5, w: 1.8, d: 0.75 },
    { x: -5, z: 3.7, w: 1.2, d: 1.5 },
    { x: -4.9, z: 2.25, w: 1.1, d: 1 },
    { x: 3.3, z: 0.8, w: 0.75, d: 0.75 },
    { x: -2.2, z: -1.35, w: 1.95, d: 1.05 },
    { x: -2.7, z: -2.2, w: 0.7, d: 0.7 },
    { x: -1.7, z: -2.2, w: 0.7, d: 0.7 },
  ],
  hotspots: [
    {
      id: 'sit',
      propId: 'chair-1',
      at: { x: 3.3, z: 1.75 },
      faces: { x: 3.3, z: 0.8 },
      icon: '🪑',
      label: 'S’asseoir',
      markerY: 1.4,
    },
    {
      id: 'sleep',
      propId: 'bed',
      at: { x: 1.85, z: -1.65 },
      faces: { x: 3.4, z: -2.05 },
      icon: '🌙',
      label: 'Dormir',
      markerY: 1.2,
    },
    {
      id: 'eat',
      propId: 'stove',
      at: { x: -2.8, z: -3.1 },
      faces: { x: -2.5, z: -4.35 },
      icon: '🍲',
      label: 'Manger',
      markerY: 1.4,
    },
    {
      id: 'relax',
      propId: 'sofa',
      at: { x: -2.9, z: 0.9 },
      faces: { x: -0.9, z: 0.8 },
      icon: '🛋️',
      label: 'Se détendre',
      markerY: 1.3,
    },
    {
      id: 'socialize',
      propId: 'table',
      at: { x: 0.45, z: 2.5 },
      faces: { x: -0.9, z: 2.45 },
      icon: '💬',
      label: 'Discuter',
      markerY: 1.1,
    },
    {
      id: 'shower',
      propId: 'shower',
      at: { x: -3.8, z: 3.5 },
      faces: { x: -5, z: 3.7 },
      icon: '🚿',
      label: 'Se laver',
      markerY: 1.4,
    },
    {
      id: 'toilet',
      propId: 'toilet',
      at: { x: -4.1, z: 2.1 },
      faces: { x: -4.9, z: 2.25 },
      icon: '🚽',
      label: 'Toilettes',
      markerY: 1.2,
    },
    {
      id: 'dining-1',
      propId: 'dining-1',
      at: { x: -3.55, z: -2.2 },
      faces: { x: -2.7, z: -2.2 },
      icon: '🪑',
      label: 'Table à manger',
      markerY: 1.4,
      hidden: true,
    },
    {
      id: 'dining-2',
      propId: 'dining-2',
      at: { x: -0.85, z: -2.2 },
      faces: { x: -1.7, z: -2.2 },
      icon: '🪑',
      label: 'Table à manger',
      markerY: 1.4,
      hidden: true,
    },
    {
      id: 'exit',
      propId: 'exit',
      at: { x: 3.6, z: -3.85 },
      faces: { x: 3.6, z: -5 },
      icon: '↗',
      label: 'Sortir de la maison',
      markerY: 2.25,
    },
  ],
  rugs: [
    { x: 3.4, z: -1.8, w: 3, d: 3.5, color: '#a8b793' },
    { x: -0.9, z: 1.85, w: 4.1, d: 3.2, color: '#b98b66' },
  ],
  plants: [
    { x: 5.2, z: -4.1, scale: 0.9 },
    { x: 5, z: 3.7, scale: 1.2 },
  ],
  door: { x: 3.6, z: -4.96 },
  palette: {
    background: '#c6d9bd',
    ground: '#b6c9a2',
    lawn: '#c4d3ae',
    plinth: '#a69a80',
    floor: '#d9d2b8',
    tileA: '#d9d3b9',
    tileB: '#d3ccb2',
    wall: '#88a29c',
    trim: '#ede8d6',
  },
}

/** Hotspot whose action is the given Saas prop, if the house offers it. */
export const hotspotForProp = (scene: HouseScene, propId: string) =>
  scene.hotspots.find((h) => h.propId === propId) ?? null
