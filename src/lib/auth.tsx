import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './supabase'

interface AuthCtx {
  session: Session | null
  loading: boolean
  teacherName: string | null
  reloadProfile: () => Promise<void>
}
const Ctx = createContext<AuthCtx>({ session: null, loading: true, teacherName: null, reloadProfile: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [teacherName, setTeacherName] = useState<string | null>(null)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setTeacherName(null); return }
    const { data } = await supabase.from('tw_teachers').select('display_name').eq('id', s.user.id).maybeSingle()
    if (data) { setTeacherName(data.display_name); return }
    // أول دخول: إنشاء ملف المعلم من الاسم المسجّل عند التسجيل
    const meta = (s.user.user_metadata?.tw_display_name as string | undefined)?.trim()
    if (meta && meta.length >= 2) {
      const { error } = await supabase.from('tw_teachers').insert({ id: s.user.id, display_name: meta.slice(0, 60) })
      if (!error) { setTeacherName(meta); return }
    }
    setTeacherName(null)
  }, [])

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setTimeout(() => loadProfile(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  return (
    <Ctx.Provider value={{ session, loading, teacherName, reloadProfile: () => loadProfile(session) }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
