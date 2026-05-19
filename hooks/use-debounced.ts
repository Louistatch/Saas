'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a debounced copy of `value`. Useful for search inputs to keep the
 * input snappy while we delay queries.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
