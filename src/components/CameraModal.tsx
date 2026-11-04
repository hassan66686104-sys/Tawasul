import { useEffect, useRef, useState } from 'react'
import { X, Camera, RefreshCw } from 'lucide-react'

/** التقاط صورة مباشرة من كاميرا الجهاز داخل الموقع (getUserMedia) */
export function CameraModal({ open, onClose, onCapture, onFallback }: {
  open: boolean; onClose: () => void; onCapture: (b: Blob) => void; onFallback: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let s: MediaStream | null = null
    let cancelled = false
    setErr(null)
    if (!navigator.mediaDevices?.getUserMedia) { onClose(); onFallback(); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((st) => {
        if (cancelled) { st.getTracks().forEach((t) => t.stop()); return }
        s = st; setStream(st)
        if (video.current) { video.current.srcObject = st; video.current.play().catch(() => {}) }
      })
      .catch((e) => {
        setErr(e?.name === 'NotAllowedError' ? 'لم يُسمح باستخدام الكاميرا. اسمح للموقع باستخدام الكاميرا من إعدادات المتصفح، أو استخدم كاميرا الجهاز.' : 'تعذّر تشغيل الكاميرا على هذا الجهاز.')
      })
    return () => { cancelled = true; s?.getTracks().forEach((t) => t.stop()); setStream(null) }
  }, [open, facing, onClose, onFallback])

  if (!open) return null
  const snap = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(v, 0, 0)
    c.toBlob((b) => { if (b) { onCapture(b); onClose() } }, 'image/jpeg', 0.9)
  }
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="pt-safe flex items-center justify-between px-3 py-2">
        <button className="icon-btn text-white hover:bg-white/10" onClick={onClose} aria-label="إغلاق الكاميرا"><X className="h-6 w-6" /></button>
        <span className="font-bold">التقاط صورة</span>
        <button className="icon-btn text-white hover:bg-white/10" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="تبديل الكاميرا"><RefreshCw className="h-5 w-5" /></button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {err ? (
          <div className="max-w-sm space-y-4 p-6 text-center">
            <p className="leading-7">{err}</p>
            <button className="btn-gold" onClick={() => { onClose(); onFallback() }}>فتح كاميرا الجهاز</button>
          </div>
        ) : (
          <video ref={video} playsInline muted autoPlay className={`max-h-full max-w-full ${facing === 'user' ? '-scale-x-100' : ''}`} />
        )}
      </div>
      {!err && (
        <div className="pb-safe flex items-center justify-center py-5">
          <button onClick={snap} disabled={!stream} aria-label="التقاط"
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 transition active:scale-90 disabled:opacity-40">
            <Camera className="h-8 w-8" />
          </button>
        </div>
      )}
    </div>
  )
}
