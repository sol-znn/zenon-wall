<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'

// The page's ground: a wall laid in courses of bricks, each stamped with a hex
// fragment like a momentum hash. It rises one course per momentum (10 s), and
// every momentum one brick lands lit in the brand green and cools off. The
// pointer is a lamp that brings the stamps up near it. Seeded, so it is the
// same wall on every visit.
//
// Between the lit bricks, the wall shows the two kinds of fuelled post: a brick
// takes the Accelerator-Z colours, or smoulders like a burn with sparks
// lifting off it. One starts every 3.75 s, the kinds alternating, so two or
// three are live at once. Each swells in and fades out over nine seconds,
// never flashes, and keeps out of the reading column when the window is wide
// enough to leave it room.
//
// Motion always runs, whatever the OS reports (webdesign-lab/RULES.md §4): the
// rise and the lit brick are how the page shows the chain is live.

const BRICK_W = 132
const BRICK_H = 34
const GAP = 6
const COURSE = BRICK_H + GAP
const MOMENTUM_MS = 10_000
const GLOW_MS = 3_200
const LAMP_R = 220
// The fuelled bricks: four lanes, each lighting one brick every FUEL_PERIOD,
// staggered a quarter period apart.
const FUEL_PERIOD = 15_000
const FUEL_MS = 9_000
const LANES = [
  {kind: 'ignite', phase: 2_000, seed: 11},
  {kind: 'burn', phase: 5_750, seed: 23},
  {kind: 'ignite', phase: 9_500, seed: 37},
  {kind: 'burn', phase: 13_250, seed: 53},
] as const
const COLUMN_W = 672 // the page's reading column, max-w-2xl
const AZ = ['hsl(145 100% 42%)', 'hsl(214 100% 56%)', 'hsl(328 95% 53%)']
const SPARKS = 6

const canvas = ref<HTMLCanvasElement | null>(null)

// mulberry32: small, fast, and the same sequence for the same seed.
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const HEX = '0123456789abcdef'
function stamp(row: number, col: number) {
  const r = rng(row * 7919 + col * 104729 + 0x2a)
  let s = ''
  for (let i = 0; i < 8; i++) s += HEX[Math.floor(r() * 16)]
  return {text: s, dim: 0.55 + r() * 0.45}
}

interface Colours {
  brick: string
  edge: string
  ink: string
  lit: string
}
function readColours(): Colours {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {brick: v('--wall-brick'), edge: v('--wall-edge'), ink: v('--wall-ink'), lit: v('--primary')}
}

let raf = 0
let observer: MutationObserver | null = null
let resize = () => {}
const pointer = {x: -9999, y: -9999}
const onMove = (e: PointerEvent) => ((pointer.x = e.clientX), (pointer.y = e.clientY))
const onLeave = () => ((pointer.x = -9999), (pointer.y = -9999))

onMounted(() => {
  const el = canvas.value
  const ctx = el?.getContext('2d')
  if (!el || !ctx) return

  let colours = readColours()
  observer = new MutationObserver(() => (colours = readColours()))
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']})

  let w = 0
  let h = 0
  resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = window.innerWidth
    h = window.innerHeight
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onMove, {passive: true})
  document.addEventListener('pointerleave', onLeave)

  const start = performance.now()
  // The brick each momentum lights: picked from the momentum's number, so it is
  // stable for the whole glow.
  const litBrick = (m: number, firstRow: number, rows: number, cols: number) => {
    const r = rng(m * 31 + 7)
    return {row: firstRow + Math.floor(r() * rows), col: Math.floor(r() * cols)}
  }

  // The brick a lane has live at time t, if any. Its place is fixed when
  // it starts: a course low enough to stay on screen while the wall rises under
  // it, and a column clear of the reading column when the window allows.
  const fuelBrick = (t: number, phase: number, seed: number, rows: number, cols: number) => {
    const k = Math.floor((t - phase) / FUEL_PERIOD)
    const p = (t - phase - k * FUEL_PERIOD) / FUEL_MS
    if (k < 0 || p >= 1) return null
    const r = rng(k * 7477 + seed)
    const row = Math.floor((phase + k * FUEL_PERIOD) / MOMENTUM_MS) + 3 + Math.floor(r() * Math.max(1, rows - 7))
    const shift = row % 2 === 0 ? 0 : -(BRICK_W + GAP) / 2
    const clear: number[] = []
    for (let col = 0; col < cols; col++) {
      const cx = shift + col * (BRICK_W + GAP) + BRICK_W / 2
      if (cx > BRICK_W / 2 && cx < w - BRICK_W / 2 && Math.abs(cx - w / 2) > COLUMN_W / 2 + BRICK_W / 2)
        clear.push(col)
    }
    const col = clear.length ? clear[Math.floor(r() * clear.length)] : Math.floor(r() * (cols - 1))
    // Swells in and out on a sine, so it never switches on or off.
    return {row, col, k, p, swell: Math.sin(Math.PI * p)}
  }

  const frame = (now: number) => {
    const t = now - start
    const rise = (t / MOMENTUM_MS) * COURSE // px risen so far
    const firstRow = Math.floor(rise / COURSE)
    const offset = rise - firstRow * COURSE
    const rows = Math.ceil(h / COURSE) + 2
    const cols = Math.ceil(w / (BRICK_W + GAP)) + 2
    const momentum = Math.floor(t / MOMENTUM_MS)
    const glow = 1 - (t - momentum * MOMENTUM_MS) / GLOW_MS
    const lit = litBrick(momentum, firstRow + 2, Math.max(1, rows - 4), cols - 1)
    const live = LANES.flatMap((lane) => {
      const b = fuelBrick(t, lane.phase, lane.seed, rows, cols)
      return b ? [{...b, kind: lane.kind, seed: lane.seed}] : []
    })
    const burning: {x: number; y: number; k: number; seed: number; p: number; swell: number}[] = []

    ctx.clearRect(0, 0, w, h)
    ctx.font = '500 10px "JetBrains Mono Variable", ui-monospace, monospace'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < rows; i++) {
      const row = firstRow + i
      const y = i * COURSE - offset
      // Running bond: every other course shifts by half a brick.
      const shift = row % 2 === 0 ? 0 : -(BRICK_W + GAP) / 2
      for (let col = 0; col < cols; col++) {
        const x = shift + col * (BRICK_W + GAP)
        const cx = x + BRICK_W / 2
        const cy = y + BRICK_H / 2
        const d = Math.hypot(cx - pointer.x, cy - pointer.y)
        const lamp = d < LAMP_R ? 1 - d / LAMP_R : 0
        const isLit = glow > 0 && row === lit.row && col === lit.col

        ctx.beginPath()
        ctx.roundRect(x, y, BRICK_W, BRICK_H, 4)
        ctx.fillStyle = colours.brick
        ctx.fill()
        ctx.strokeStyle = colours.edge
        ctx.lineWidth = 1
        ctx.stroke()

        if (isLit) {
          ctx.globalAlpha = 0.85 * glow
          ctx.fillStyle = colours.lit
          ctx.fill()
          ctx.globalAlpha = 1
        }

        // Accelerator-Z: the three brand colours drifting slowly across it.
        const fuel = live.find((f) => f.row === row && f.col === col)
        const fuelled = fuel?.swell ?? 0
        if (fuel?.kind === 'ignite') {
          const drift = (fuel.p - 0.5) * BRICK_W
          const g = ctx.createLinearGradient(x - BRICK_W + drift, y, x + 2 * BRICK_W + drift, y + BRICK_H)
          g.addColorStop(0, AZ[0])
          g.addColorStop(0.5, AZ[1])
          g.addColorStop(1, AZ[2])
          ctx.globalAlpha = 0.55 * fuelled
          ctx.fillStyle = g
          ctx.fill()
          ctx.globalAlpha = 1
        }
        // Burn: heat from the bottom edge, its strength wandering on two
        // unrelated slow waves so it smoulders rather than pulses.
        if (fuel?.kind === 'burn') {
          const heat = 0.85 + 0.15 * Math.sin(t / 1300) * Math.sin(t / 2100 + 1)
          const g = ctx.createRadialGradient(cx, y + BRICK_H + 6, 0, cx, y + BRICK_H + 6, BRICK_W * 0.62)
          g.addColorStop(0, 'hsl(42 100% 58%)')
          g.addColorStop(0.35, 'hsl(24 100% 52%)')
          g.addColorStop(0.7, 'hsl(352 90% 48% / 0.5)')
          g.addColorStop(1, 'hsl(352 90% 48% / 0)')
          ctx.globalAlpha = 0.35 * fuelled * heat
          ctx.fillStyle = g
          ctx.fill()
          ctx.globalAlpha = 1
          burning.push({x, y, k: fuel.k, seed: fuel.seed, p: fuel.p, swell: fuel.swell})
        }

        const s = stamp(row, col)
        ctx.globalAlpha = isLit
          ? Math.max(0.3, glow)
          : Math.max(s.dim * (0.1 + 0.6 * lamp * lamp), 0.45 * fuelled)
        ctx.fillStyle = isLit || fuelled ? colours.brick : colours.ink
        ctx.fillText(s.text, x + 12, cy + 0.5)
        ctx.globalAlpha = 1
      }
    }

    // Sparks off each burning brick, drawn last so they rise over the course
    // above. Each has its own seeded start, drift and life, so they lift
    // unevenly; they only show while the brick is swelling.
    for (const b of burning) {
      const r = rng(b.k * 3571 + b.seed)
      const elapsed = b.p * FUEL_MS
      for (let i = 0; i < SPARKS; i++) {
        const life = 1800 + r() * 1600
        const delay = r() * life
        const x0 = b.x + 14 + r() * (BRICK_W - 28)
        const sway = 4 + r() * 8
        const q = ((elapsed + delay) % life) / life
        const sx = x0 + Math.sin(q * Math.PI * 2 + i) * sway
        const sy = b.y + 4 - q * 46
        ctx.globalAlpha = 0.7 * b.swell * Math.sin(Math.PI * q)
        ctx.fillStyle = i % 2 ? 'hsl(42 100% 62%)' : 'hsl(24 100% 56%)'
        ctx.beginPath()
        ctx.arc(sx, sy, 1.3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  observer?.disconnect()
  window.removeEventListener('resize', resize)
  window.removeEventListener('pointermove', onMove)
  document.removeEventListener('pointerleave', onLeave)
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
    <canvas ref="canvas" class="size-full" />
    <!-- Let the wall fall away behind the reading column and toward the bottom. -->
    <div class="wall-fade absolute inset-0" />
  </div>
</template>
