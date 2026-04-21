import { useContext, useEffect } from 'react'
import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom'

interface TransitionLike {
  retry: () => void
}

interface BlockableNavigator {
  block?: (listener: (transition: TransitionLike) => void) => () => void
}

export function useUnsavedChangesPrompt(when: boolean, message = '当前有未保存的修改，确认离开吗？') {
  const navigationContext = useContext(NavigationContext)

  useEffect(() => {
    if (!when) return

    const navigator = navigationContext?.navigator as BlockableNavigator | undefined
    if (!navigator || typeof navigator.block !== 'function') return

    const unblock = navigator.block((transition: TransitionLike) => {
      const allow = window.confirm(message)
      if (!allow) return
      unblock()
      transition.retry()
    })

    return unblock
  }, [message, navigationContext, when])

  useEffect(() => {
    if (!when) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [message, when])
}
