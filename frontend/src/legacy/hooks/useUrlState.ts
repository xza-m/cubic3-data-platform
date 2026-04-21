import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'

export function useUrlState<T extends string>(key: string, defaultValue: T) {
  const [params, setParams] = useSearchParams()
  const value = (params.get(key) as T) || defaultValue

  const setValue = useCallback(
    (v: T) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          v === defaultValue ? next.delete(key) : next.set(key, v)
          return next
        },
        { replace: true },
      )
    },
    [key, defaultValue, setParams],
  )

  return [value, setValue] as const
}
