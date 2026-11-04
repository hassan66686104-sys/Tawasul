const LOCALE = 'ar-u-nu-latn-ca-gregory'

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
export function fmtDate(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso))
}
export function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
export function dayLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(now) - start(d)) / 86400000)
  if (diff === 0) return 'اليوم'
  if (diff === 1) return 'أمس'
  return new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}
export function relative(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'الآن'
  if (s < 3600) return `قبل ${Math.floor(s / 60)} د`
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} س`
  return fmtDate(iso)
}
export const STATUS_LABEL: Record<string, string> = {
  open: 'مفتوحة', closed: 'مغلقة', expired: 'منتهية', archived: 'مؤرشفة',
}
export const ACCESS_LABEL: Record<string, string> = {
  open: 'مفتوحة لكل من يملك الرابط', roster: 'قائمة أسماء محددة', code: 'رموز دخول فردية',
}
export function cleanName(s: string) {
  return s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim()
}
export function joinUrl(slug: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}j/${slug}`
}
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
