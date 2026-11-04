import { useEffect, useState } from 'react'

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIPEvent | null = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIPEvent })

export function useInstallPrompt() {
  const [can, setCan] = useState(!!deferred)
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); deferred = e as BIPEvent; setCan(true) }
    window.addEventListener('beforeinstallprompt', h)
    const done = () => setCan(false)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', done) }
  }, [])
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return {
    canInstall: can && !standalone,
    iosHint: ios && !standalone,
    prompt: async () => { if (!deferred) return; await deferred.prompt(); deferred = null; setCan(false) },
  }
}
