import { useCallback, useRef, useState } from 'react'

export function createLoadingActionController(onChange = () => {}) {
  const active = new Set()

  return {
    begin(key) {
      if (active.has(key)) return false
      active.add(key)
      onChange(new Set(active))
      return true
    },
    end(key) {
      if (!active.delete(key)) return false
      onChange(new Set(active))
      return true
    },
    has(key) {
      return active.has(key)
    },
    snapshot() {
      return new Set(active)
    },
  }
}

export function useLoadingActions() {
  const [active, setActive] = useState(() => new Set())
  const controller = useRef(null)
  if (!controller.current) controller.current = createLoadingActionController(setActive)

  const run = useCallback(async (key, action) => {
    if (!controller.current.begin(key)) return { started: false }
    try {
      return { started: true, value: await action() }
    } finally {
      controller.current.end(key)
    }
  }, [])

  return {
    begin: controller.current.begin,
    end: controller.current.end,
    isLoading: (key) => active.has(key),
    run,
  }
}
