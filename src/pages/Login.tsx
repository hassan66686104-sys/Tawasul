import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { KeyRound, User, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { MIN_PASSCODE, normalizePasscode, passcodeCredentials } from '../lib/passcode'
import { Logo, Spinner, toast } from '../components/ui'

export default function Login() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [code, setCode] = useState('')
  const [code2, setCode2] = useState('')
  const [show, setShow] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (session) return <Navigate to="/t" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const c = normalizePasscode(code)
    if (!c) { setErr('اكتب رمز المرور'); return }
    if (mode === 'signup') {
      if (name.trim().length < 2) { setErr('اكتب اسمك كما سيظهر للطلاب'); return }
      if (c.length < MIN_PASSCODE) { setErr(`رمز المرور يجب أن يكون ${MIN_PASSCODE} أحرف أو أرقام على الأقل`); return }
      if (c !== normalizePasscode(code2)) { setErr('الرمزان غير متطابقين'); return }
    }
    setBusy(true)
    try {
      const cred = await passcodeCredentials(c)
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword(cred)
        if (error) throw error
        nav('/t')
      } else {
        const { data, error } = await supabase.auth.signUp({ ...cred, options: { data: { tw_display_name: name.trim() } } })
        if (error) throw error
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered')
        if (!data.session) {
          const { error: e3 } = await supabase.auth.signInWithPassword(cred)
          if (e3) throw e3
        }
        toast.ok('تم إنشاء الحساب، احفظ رمز المرور جيدًا')
        nav('/t')
      }
    } catch (e2) { setErr(errorMessage(e2)) } finally { setBusy(false) }
  }

  const pwInput = (id: string, val: string, set: (v: string) => void, ac: string, ph?: string) => (
    <div className="relative"><KeyRound className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
      <input id={id} type={show ? 'text' : 'password'} required dir="ltr" autoComplete={ac} placeholder={ph}
        className="input pe-11 ps-10 text-right tracking-widest" value={val} onChange={(e) => set(e.target.value)} maxLength={64} />
      <button type="button" className="absolute end-2 top-2 rounded-lg p-1.5 text-navy-400 hover:bg-navy-50" onClick={() => setShow((s) => !s)} aria-label={show ? 'إخفاء الرمز' : 'إظهار الرمز'}>
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  )

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-navy-900 to-navy-700 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Link to="/"><Logo light size={48} /></Link></div>
        <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8">
          <h1 className="text-center text-2xl font-extrabold">{mode === 'login' ? 'دخول المعلم' : 'إنشاء حساب معلم'}</h1>
          {mode === 'signup' && (
            <div>
              <label className="label" htmlFor="nm">اسمك كما يظهر للطلاب</label>
              <div className="relative"><User className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
                <input id="nm" className="input ps-10" placeholder="مثال: أ. حسن" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="pc">{mode === 'login' ? 'رمز المرور' : `اختر رمز مرور (${MIN_PASSCODE} أحرف أو أرقام على الأقل)`}</label>
            {pwInput('pc', code, setCode, mode === 'login' ? 'current-password' : 'new-password')}
          </div>
          {mode === 'signup' && (
            <div>
              <label className="label" htmlFor="pc2">أعد كتابة رمز المرور</label>
              {pwInput('pc2', code2, setCode2, 'new-password')}
              <p className="mt-2 text-xs text-navy-500">احفظ الرمز في مكان آمن؛ هو مفتاح حسابك الوحيد ولا يُرسل إلى أي بريد.</p>
            </div>
          )}
          {err && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{err}</div>}
          <button className="btn-primary w-full py-3 text-lg" disabled={busy}>
            {busy && <Spinner className="h-5 w-5" />}
            {mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
          </button>
          <div className="flex flex-col items-center gap-2 text-sm">
            {mode === 'login'
              ? <button type="button" className="font-semibold text-navy-600 hover:underline" onClick={() => { setMode('signup'); setErr(null) }}>أول مرة؟ أنشئ حساب معلم</button>
              : <button type="button" className="flex items-center gap-1 font-semibold text-navy-600 hover:underline" onClick={() => { setMode('login'); setErr(null) }}><ArrowRight className="h-4 w-4" /> لديّ رمز، العودة للدخول</button>}
          </div>
        </form>
        <p className="mt-4 text-center text-sm text-navy-200">الطلاب لا يحتاجون حسابًا؛ يدخلون من رابط المحادثة مباشرة.</p>
      </div>
    </div>
  )
}
