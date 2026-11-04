import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Share2, Download, Check, Maximize2 } from 'lucide-react'
import { joinUrl } from '../lib/format'
import { toast } from './ui'

export function SharePanel({ slug, title }: { slug: string; title: string }) {
  const url = joinUrl(slug)
  const [qr, setQr] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [big, setBig] = useState(false)
  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0d1a30', light: '#ffffff' } }).then(setQr)
  }, [url])

  const copy = async () => {
    try { await navigator.clipboard.writeText(url) } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopied(true); toast.ok('تم نسخ الرابط'); setTimeout(() => setCopied(false), 2000)
  }
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: `تواصل – ${title}`, text: `ادخل إلى محادثة درس «${title}»`, url }) } catch { /* أُلغيت المشاركة */ }
    } else copy()
  }
  const downloadQr = () => {
    const a = document.createElement('a'); a.href = qr; a.download = `QR-${title}.png`; a.click()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">رابط المحادثة</label>
        <div className="flex items-center gap-2 rounded-xl border border-navy-200 bg-navy-50/50 p-1.5 ps-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-700" dir="ltr">{url}</span>
          <button className="btn-primary px-3 py-2 text-sm" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} نسخ</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-gold" onClick={share}><Share2 className="h-5 w-5" /> مشاركة الرابط</button>
        <button className="btn-outline" onClick={downloadQr} disabled={!qr}><Download className="h-5 w-5" /> تنزيل QR</button>
      </div>
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-navy-100 bg-white p-4">
        {qr ? <img src={qr} alt="رمز QR للدخول السريع" className="h-48 w-48" /> : <div className="h-48 w-48 animate-pulse rounded-xl bg-navy-50" />}
        <p className="text-center text-sm text-navy-500">يمسح الطالب الرمز بكاميرا جواله للدخول مباشرة</p>
        <button className="btn-ghost text-sm" onClick={() => setBig(true)}><Maximize2 className="h-4 w-4" /> عرض بملء الشاشة للسبورة</button>
      </div>
      {big && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-white p-6" onClick={() => setBig(false)}>
          <h2 className="text-center text-3xl font-extrabold text-navy-900">{title}</h2>
          <img src={qr} alt="رمز QR" className="aspect-square w-[min(80vw,70vh)]" />
          <p className="text-xl font-bold text-navy-600" dir="ltr">{url}</p>
          <p className="text-navy-400">اضغط في أي مكان للإغلاق</p>
        </div>
      )}
    </div>
  )
}
