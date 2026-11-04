import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

export type SyncState = 'connecting' | 'live' | 'polling'

/**
 * الاشتراك في القناة اللحظية السرية للمحادثة (Supabase Realtime Broadcast)
 * مع احتياط بالسحب الدوري إن انقطع الاتصال، وتحديث فوري عند عودة التركيز للتطبيق.
 */
export function useConversationSync(secretKey: string | undefined, onSignal: (kind: string) => void) {
  const [state, setState] = useState<SyncState>('connecting')
  const cb = useRef(onSignal)
  cb.current = onSignal

  useEffect(() => {
    if (!secretKey) return
    let live = false
    let debounce: ReturnType<typeof setTimeout> | null = null
    const kinds = new Set<string>()
    const fire = (kind: string) => {
      kinds.add(kind)
      if (debounce) return
      debounce = setTimeout(() => {
        debounce = null
        const ks = [...kinds]
        kinds.clear()
        ks.forEach((k) => cb.current(k))
      }, 120)
    }
    const channel = supabase
      .channel(`tw:${secretKey}`, { config: { broadcast: { self: false }, private: false } })
      .on('broadcast', { event: 'sync' }, (msg) => fire((msg.payload as { kind?: string })?.kind || 'msg'))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { live = true; setState('live'); fire('all') }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { live = false; setState('polling') }
      })

    let tick = 0
    const poll = setInterval(() => {
      tick++
      if (document.hidden) return
      if (!live || tick % 6 === 0) fire('all') // كل 3 ثوانٍ عند الانقطاع، وكل 18 ثانية للتأكيد
    }, 3000)
    const wake = () => { if (!document.hidden) fire('all') }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    return () => {
      clearInterval(poll)
      if (debounce) clearTimeout(debounce)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      supabase.removeChannel(channel)
    }
  }, [secretKey])

  return state
}
