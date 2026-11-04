import { useEffect, useState } from 'react'
import { X, Download, ZoomIn, ZoomOut } from 'lucide-react'
import { signedUrl, downloadImage } from '../lib/media'
import { fmtDateTime } from '../lib/format'
import { toast } from './ui'

export interface LightboxItem { path: string; name: string; at: string }

export function Lightbox({ item, onClose, allowDownload }: { item: LightboxItem | null; onClose: () => void; allowDownload?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    setZoom(1); setUrl(null)
    if (item) signedUrl(item.path).then(setUrl)
  }, [item])
  useEffect(() => {
    if (!item) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [item, onClose])
  if (!item) return null
  const dl = async () => {
    try {
      const ext = item.path.split('.').pop() || 'jpg'
      await downloadImage(item.path, `${item.name}-${item.at.slice(0, 16).replace(/[:T]/g, '-')}.${ext}`)
    } catch { toast.err('تعذّر تنزيل الصورة') }
  }
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true">
      <div className="pt-safe flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0 px-2">
          <div className="truncate font-bold">{item.name}</div>
          <div className="text-xs text-white/60">{fmtDateTime(item.at)}</div>
        </div>
        <div className="flex items-center gap-1">
          <button className="icon-btn text-white hover:bg-white/10" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="تصغير"><ZoomOut className="h-5 w-5" /></button>
          <button className="icon-btn text-white hover:bg-white/10" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} aria-label="تكبير"><ZoomIn className="h-5 w-5" /></button>
          {allowDownload && <button className="icon-btn text-white hover:bg-white/10" onClick={dl} aria-label="تنزيل الصورة"><Download className="h-5 w-5" /></button>}
          <button className="icon-btn text-white hover:bg-white/10" onClick={onClose} aria-label="إغلاق"><X className="h-6 w-6" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-auto" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ touchAction: 'pinch-zoom pan-x pan-y' }}>
        <div className="flex min-h-full min-w-full items-center justify-center p-2" onClick={(e) => e.target === e.currentTarget && onClose()}>
          {url ? (
            <img src={url} alt={`صورة من ${item.name}`} onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2.5))}
              style={{ maxWidth: zoom === 1 ? '100%' : 'none', maxHeight: zoom === 1 ? 'calc(100dvh - 80px)' : 'none', width: zoom === 1 ? 'auto' : `${zoom * 100}%` }}
              className="select-none rounded-lg object-contain transition-[width]" />
          ) : <div className="text-white/60">جارٍ تحميل الصورة…</div>}
        </div>
      </div>
    </div>
  )
}
