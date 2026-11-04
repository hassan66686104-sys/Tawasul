import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MessagesSquare, Camera, ShieldCheck, QrCode, LogIn, ArrowLeft, Download } from 'lucide-react'
import { Logo } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useInstallPrompt } from '../lib/pwa'

export default function Home() {
  const { session } = useAuth()
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const install = useInstallPrompt()
  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const m = code.trim().match(/(?:\/j\/)?([a-z0-9]{6,12})\/?$/i)
    if (m) nav(`/j/${m[1].toLowerCase()}`)
  }
  return (
    <div className="min-h-full bg-gradient-to-b from-navy-900 via-navy-800 to-navy-700 text-white">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-5 pt-safe">
        <header className="flex items-center justify-between py-5">
          <Logo light />
          <Link to={session ? '/t' : '/login'} className="btn bg-white/10 text-white hover:bg-white/20">
            <LogIn className="h-5 w-5" /> {session ? 'لوحة المعلم' : 'دخول المعلم'}
          </Link>
        </header>
        <main className="grid flex-1 items-center gap-10 py-8 md:grid-cols-2">
          <div className="space-y-6">
            <h1 className="text-4xl font-extrabold leading-[1.35] md:text-5xl">
              مساحة تواصل آمنة<br />بين <span className="text-gold-300">المعلم</span> و<span className="text-mint-200">طلابه</span>
            </h1>
            <p className="max-w-md text-lg leading-8 text-navy-100">
              أنشئ محادثة لكل درس، شارك الرابط أو رمز QR، واستقبل رسائل الطلاب وصورهم لحظيًا، وكل شيء محفوظ في حسابك.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to={session ? '/t' : '/login'} className="btn-gold px-6 py-3 text-lg">ابدأ كمعلم <ArrowLeft className="h-5 w-5" /></Link>
              {install.canInstall && <button onClick={install.prompt} className="btn bg-white/10 px-5 py-3 text-white hover:bg-white/20"><Download className="h-5 w-5" /> تثبيت التطبيق</button>}
            </div>
            {install.iosHint && <p className="text-sm text-navy-200">لتثبيت التطبيق على iPhone/iPad: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».</p>}
          </div>
          <div className="card space-y-4 p-6 text-navy-900">
            <h2 className="text-xl font-bold">أنا طالب</h2>
            <p className="text-sm leading-6 text-navy-500">افتح الرابط الذي أرسله معلمك، أو امسح رمز QR، أو الصق الرابط هنا:</p>
            <form onSubmit={go} className="flex gap-2">
              <input className="input" dir="ltr" placeholder="رابط المحادثة أو رمزها" value={code} onChange={(e) => setCode(e.target.value)} />
              <button className="btn-primary shrink-0">دخول</button>
            </form>
            <div className="grid grid-cols-2 gap-3 pt-2 text-sm">
              {[
                { i: <MessagesSquare className="h-5 w-5" />, t: 'محادثة لحظية' },
                { i: <Camera className="h-5 w-5" />, t: 'صور من الكاميرا' },
                { i: <QrCode className="h-5 w-5" />, t: 'دخول سريع بـ QR' },
                { i: <ShieldCheck className="h-5 w-5" />, t: 'خصوصية وحماية' },
              ].map((f) => (
                <div key={f.t} className="flex items-center gap-2 rounded-xl bg-navy-50 px-3 py-2.5 font-semibold text-navy-700">{f.i}{f.t}</div>
              ))}
            </div>
          </div>
        </main>
        <footer className="pb-safe py-6 text-center text-sm text-navy-200">تواصل – مساحة التعلم</footer>
      </div>
    </div>
  )
}
