'use client'

import { useEffect, useState } from 'react'

/** Firefox Android's visible viewport can be shorter than the fixed-position layout viewport. */
export function useHarooLifeViewport<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  useEffect(() => {
    if (!node) return
    const viewport = window.visualViewport
    const root = document.documentElement
    const previous = ['--haroo-visible-height', '--haroo-bottom-gap'].map((name) => [
      name,
      root.style.getPropertyValue(name),
    ])
    let frame = 0
    const update = () => {
      frame = 0
      // Pinch zoom belongs to the browser; do not move the controls under the fingers.
      if (viewport && Math.abs(viewport.scale - 1) > 0.02) return
      const height = viewport?.height || window.innerHeight
      const top = viewport?.offsetTop || 0
      if (!(height > 0)) return
      node.style.height = `${height}px`
      node.style.top = `${top}px`
      root.style.setProperty('--haroo-visible-height', `${height}px`)
      root.style.setProperty(
        '--haroo-bottom-gap',
        `${Math.max(0, window.innerHeight - height - top)}px`,
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value)
        else root.style.removeProperty(name)
      }
    }
  }, [node])
  return setNode
}
