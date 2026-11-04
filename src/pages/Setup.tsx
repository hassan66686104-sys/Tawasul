import { Logo } from '../components/ui'

export default function Setup() {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card max-w-lg space-y-4 p-8">
        <Logo />
        <h1 className="text-xl font-bold">الموقع يحتاج إلى ربطه بـ Supabase</h1>
        <p className="leading-7 text-navy-600">
          أضف المتغيرين <code className="rounded bg-navy-50 px-1" dir="ltr">VITE_SUPABASE_URL</code> و
          <code className="rounded bg-navy-50 px-1" dir="ltr">VITE_SUPABASE_ANON_KEY</code> في إعدادات النشر (أو ملف <code dir="ltr">.env</code>)
          ثم أعد بناء الموقع. التفاصيل في ملف «دليل التشغيل».
        </p>
      </div>
    </div>
  )
}
