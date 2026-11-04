import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, ArrowRight } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Logo, Spinner, toast } from '../components/ui'

export default function Login() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  if (session) return <Navigate to="/t" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null); setInfo(null)
    if (mode === 'signup' && name.trim().length < 2) { setErr('اكتب اسمك كما سيظهر للطلاب'); return }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        nav('/t')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { tw_display_name: name.trim() }, emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}t` },
        })
        if (error) throw error
        if (data.session) { toast.ok('تم إنشاء الحساب'); nav('/t') }
        else setInfo('أرسلنا رسالة تأكيد إلى بريدك. افتحها واضغط على الرابط ثم سجّل الدخول.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}reset` })
        if (error) throw error
        setInfo('أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك.')
      }
    } catch (e2) { setErr(errorMessage(e2)) } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-b from-navy-900 to-navy-700 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Link to="/"><Logo light size={48} /></Link></div>
        <form onSubmit={submit} className="card space-y-4 p-6 sm:p-8">
          <h1 className="text-center text-2xl font-extrabold">
            {mode === 'login' ? 'دخول المعلم' : mode === 'signup' ? 'إنشاء حساب معلم' : 'استعادة كلمة المرور'}
          </h1>
          {mode === 'signup' && (
            <div>
              <label className="label" htmlFor="nm">اسمك كما يظهر للطلاب</label>
              <div className="relative"><User className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
                <input id="nm" className="input ps-10" placeholder="مثال: أ. حسن" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="em">البريد الإلكتروني</label>
            <div className="relative"><Mail className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
              <input id="em" type="email" required dir="ltr" autoComplete="email" className="input ps-10 text-right" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          {mode !== 'forgot' && (
            <div>
              <label className="label" htmlFor="pw">كلمة المرور</label>
              <div className="relative"><Lock className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
                <input id="pw" type="password" required minLength={6} dir="ltr" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="input ps-10 text-right" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            </div>
          )}
          {err && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{err}</div>}
          {info && <div className="rounded-xl bg-mint-50 px-4 py-3 text-sm font-semibold text-mint-700">{info}</div>}
          <button className="btn-primary w-full py-3 text-lg" disabled={busy}>
            {busy && <Spinner className="h-5 w-5" />}
            {mode === 'login' ? 'دخول' : mode === 'signup' ? 'إنشاء الحساب' : 'إرسال الرابط'}
          </button>
          <div className="flex flex-col items-center gap-2 text-sm">
            {mode === 'login' ? (<>
              <button type="button" className="font-semibold text-navy-600 hover:underline" onClick={() => setMode('signup')}>ليس لديك حساب؟ أنشئ حسابًا</button>
              <button type="button" className="text-navy-400 hover:underline" onClick={() => setMode('forgot')}>نسيت كلمة المرور؟</button>
            </>) : (
              <button type="button" className="flex items-center gap-1 font-semibold text-navy-600 hover:underline" onClick={() => setMode('login')}><ArrowRight className="h-4 w-4" /> العودة لتسجيل الدخول</button>
            )}
          </div>
        </form>
        <p className="mt-4 text-center text-sm text-navy-200">الطلاب لا يحتاجون حسابًا؛ يدخلون من رابط المحادثة مباشرة.</p>
      </div>
    </div>
  )
}
