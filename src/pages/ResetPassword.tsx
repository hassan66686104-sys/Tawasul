import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { Logo, Spinner, toast } from '../components/ui'

export default function ResetPassword() {
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setErr(errorMessage(error)); else { toast.ok('تم تغيير كلمة المرور'); nav('/t') }
  }
  return (
    <div className="flex min-h-full items-center justify-center bg-navy-800 p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6">
        <Logo />
        <h1 className="text-xl font-bold">كلمة مرور جديدة</h1>
        <input type="password" minLength={6} required dir="ltr" className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6 أحرف على الأقل" />
        {err && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner className="h-5 w-5" />} حفظ</button>
      </form>
    </div>
  )
}
