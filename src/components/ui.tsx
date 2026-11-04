import { ReactNode, useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export function Logo({ size = 40, light = false }: { size?: number; light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" fill="#13233f" />
        <path d="M14 22a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H30l-9 7v-7h0a8 8 0 0 1-7-8z" fill="#fff" />
        <circle cx="25" cy="28" r="3" fill="#d4ab2e" />
        <circle cx="32" cy="28" r="3" fill="#1f9a6e" />
        <circle cx="39" cy="28" r="3" fill="#d4ab2e" />
      </svg>
      <div className="leading-tight">
        <div className={`text-lg font-extrabold ${light ? 'text-white' : 'text-navy-900'}`}>تواصل</div>
        <div className={`text-[11px] font-semibold ${light ? 'text-gold-200' : 'text-gold-500'}`}>مساحة التعلم</div>
      </div>
    </div>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} aria-label="جارٍ التحميل" />
}

export function FullLoader({ text = 'جارٍ التحميل…' }: { text?: string }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-navy-500">
      <Spinner className="h-8 w-8" />
      <span className="text-sm">{text}</span>
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide = false, footer }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/50 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`animate-pop flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="flex items-center justify-between gap-2 border-b border-navy-100 px-5 py-3.5">
          <h2 className="text-lg font-bold text-navy-900">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>
        <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-navy-100 px-5 pt-3">{footer}</div>}
      </div>
    </div>
  )
}

type ConfirmOpts = { title: string; text?: string; confirm?: string; danger?: boolean }
let confirmFn: ((o: ConfirmOpts) => Promise<boolean>) | null = null
export function confirmDialog(o: ConfirmOpts) { return confirmFn ? confirmFn(o) : Promise.resolve(window.confirm(o.title)) }

export function ConfirmHost() {
  const [st, setSt] = useState<(ConfirmOpts & { resolve: (b: boolean) => void }) | null>(null)
  useEffect(() => { confirmFn = (o) => new Promise((resolve) => setSt({ ...o, resolve })); return () => { confirmFn = null } }, [])
  const done = (b: boolean) => { st?.resolve(b); setSt(null) }
  return (
    <Modal open={!!st} onClose={() => done(false)} title={st?.title}>
      {st?.text && <p className="mb-4 leading-7 text-navy-600">{st.text}</p>}
      <div className="flex gap-2 pb-2">
        <button className={st?.danger ? 'btn-danger flex-1' : 'btn-primary flex-1'} onClick={() => done(true)} autoFocus>{st?.confirm || 'تأكيد'}</button>
        <button className="btn-outline flex-1" onClick={() => done(false)}>إلغاء</button>
      </div>
    </Modal>
  )
}

type T = { id: number; text: string; kind: 'ok' | 'err' }
let pushToast: ((t: Omit<T, 'id'>) => void) | null = null
export const toast = {
  ok: (text: string) => pushToast?.({ text, kind: 'ok' }),
  err: (text: string) => pushToast?.({ text, kind: 'err' }),
}
export function ToastHost() {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => {
    let n = 0
    pushToast = (t) => {
      const id = ++n
      setItems((xs) => [...xs, { ...t, id }])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.kind === 'err' ? 5000 : 2600)
    }
    return () => { pushToast = null }
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 pt-safe">
      {items.map((t) => (
        <div key={t.id} className={`animate-pop pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ${t.kind === 'ok' ? 'bg-navy-900 text-white' : 'bg-red-600 text-white'}`}>
          {t.kind === 'ok' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-mint-200" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: 'bg-mint-50 text-mint-700 ring-1 ring-mint-200',
    closed: 'bg-navy-50 text-navy-600 ring-1 ring-navy-200',
    expired: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    archived: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  }
  const label: Record<string, string> = { open: 'مفتوحة', closed: 'مغلقة', expired: 'منتهية', archived: 'مؤرشفة' }
  return <span className={`chip ${map[status] || map.closed}`}>{status === 'open' && <span className="h-1.5 w-1.5 rounded-full bg-mint-500" />}{label[status] || status}</span>
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-50 text-navy-400">{icon}</div>
      <h3 className="text-lg font-bold text-navy-800">{title}</h3>
      {text && <p className="max-w-sm text-sm leading-6 text-navy-500">{text}</p>}
      {action}
    </div>
  )
}
