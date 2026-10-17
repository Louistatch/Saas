'use client'

/**
 * Analogue virtual joystick (Pointer Events, pointer capture): a floating base appears
 * where the finger lands in its zone, the knob follows within a radius, and the normalised
 * vector is written straight into a shared input object read by the player controller each
 * frame. No React state changes while moving: the knob is moved through the DOM.
 */
import { type InputState, joystickVector } from '@/lib/haroolife/city/player'
import { useEffect, useRef } from 'react'

export const RADIUS = 52

export default function Joystick({
  input,
  disabled = false,
  onActive,
}: {
  /** Shared, mutated in place; the controller reads it every frame. */
  input: InputState
  disabled?: boolean
  /** Called once when the finger lands (lets the host cancel a route and follow the player). */
  onActive?: () => void
}) {
  const zone = useRef<HTMLDivElement | null>(null)
  const base = useRef<HTMLDivElement | null>(null)
  const knob = useRef<HTMLDivElement | null>(null)
  const state = useRef<{ id: number; cx: number; cy: number } | null>(null)
  useEffect(() => {
    const el = zone.current
    if (!el) return
    const release = () => {
      state.current = null
      input.x = 0
      input.y = 0
      input.run = false
      if (base.current) base.current.style.opacity = '0.55'
      if (knob.current) knob.current.style.transform = 'translate(0px, 0px)'
    }
    const down = (e: PointerEvent) => {
      if (disabled) return
      // A finger already holds the stick: ignore a second one, unless the first was lost
      // without an up/cancel event (Android can drop it on a system gesture or a dialog).
      if (state.current) {
        if (el.hasPointerCapture(state.current.id)) return
        release()
      }
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      const r = el.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      state.current = { id: e.pointerId, cx, cy }
      if (base.current) {
        base.current.style.left = `${cx - RADIUS}px`
        base.current.style.top = `${cy - RADIUS}px`
        base.current.style.opacity = '1'
      }
      onActive?.()
    }
    const move = (e: PointerEvent) => {
      const s = state.current
      if (!s || e.pointerId !== s.id) return
      // A mouse moving with no button down: its release was missed (a modal dialog opened
      // under the drag). Never let a hovering pointer walk the player.
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        release()
        return
      }
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const dx = e.clientX - r.left - s.cx
      const dy = e.clientY - r.top - s.cy
      const v = joystickVector(dx, dy, RADIUS)
      input.x = v.x
      input.y = v.y
      input.run = v.magnitude >= 0.98
      if (knob.current) {
        const len = Math.hypot(dx, dy)
        const k = len > RADIUS ? RADIUS / len : 1
        knob.current.style.transform = `translate(${dx * k}px, ${dy * k}px)`
      }
    }
    const up = (e: PointerEvent) => {
      const s = state.current
      if (!s || e.pointerId !== s.id) return
      release()
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('lostpointercapture', up)
    // Switching app, a notification shade or a phone call must not leave the player walking.
    const hidden = () => {
      if (document.visibilityState === 'hidden') release()
    }
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', hidden)
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('lostpointercapture', up)
      release()
    }
  }, [input, disabled, onActive])
  useEffect(() => {
    if (disabled) {
      input.x = 0
      input.y = 0
      input.run = false
    }
  }, [disabled, input])
  return (
    <div
      ref={zone}
      role="application"
      aria-label="Joystick de déplacement"
      data-testid="joystick"
      className="pointer-events-auto relative h-[150px] w-[150px] select-none touch-none"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={base}
        className="absolute h-[104px] w-[104px] rounded-full border-2 border-white/80 bg-slate-900/35 shadow-lg backdrop-blur-sm"
        style={{ left: 75 - RADIUS, top: 75 - RADIUS, opacity: 0.55 }}
      >
        <div
          ref={knob}
          className="absolute left-[26px] top-[26px] h-[48px] w-[48px] rounded-full bg-white shadow-md"
        />
      </div>
    </div>
  )
}

/** Keyboard locomotion (WASD, arrows, Shift to run) into the same input object. */
export function useKeyboardInput(input: InputState, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const held = new Set<string>()
    const apply = () => {
      const x =
        (held.has('d') || held.has('arrowright') ? 1 : 0) -
        (held.has('a') || held.has('arrowleft') ? 1 : 0)
      const y =
        (held.has('w') || held.has('arrowup') ? 1 : 0) -
        (held.has('s') || held.has('arrowdown') ? 1 : 0)
      const len = Math.hypot(x, y)
      input.x = len > 0 ? x / len : 0
      input.y = len > 0 ? y / len : 0
      input.run = held.has('shift')
    }
    const editing = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    const down = (e: KeyboardEvent) => {
      if (editing(e)) return
      const k = e.key.toLowerCase()
      if (
        ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)
      ) {
        if (k.startsWith('arrow')) e.preventDefault()
        held.add(k)
        apply()
      }
    }
    const up = (e: KeyboardEvent) => {
      held.delete(e.key.toLowerCase())
      apply()
    }
    const blur = () => {
      held.clear()
      apply()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      blur()
    }
  }, [input, enabled])
}
