import { supabase, BUCKET } from './supabase'

// ذاكرة مؤقتة للروابط الموقّعة (صالحة ساعتين)
const cache = new Map<string, { url: string; exp: number }>()
const pending = new Map<string, Promise<string | null>>()
let queue: string[] = []
let timer: ReturnType<typeof setTimeout> | null = null
const waiters = new Map<string, ((u: string | null) => void)[]>()
const TTL = 7200

async function flush() {
  timer = null
  const paths = [...new Set(queue)]
  queue = []
  if (!paths.length) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, TTL)
  for (const p of paths) {
    const row = data?.find((d) => d.path === p)
    const url = !error && row?.signedUrl ? row.signedUrl : null
    if (url) cache.set(p, { url, exp: Date.now() + (TTL - 300) * 1000 })
    for (const w of waiters.get(p) || []) w(url)
    waiters.delete(p)
    pending.delete(p)
  }
}

export function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path)
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url)
  const p = pending.get(path)
  if (p) return p
  const prom = new Promise<string | null>((resolve) => {
    waiters.set(path, [...(waiters.get(path) || []), resolve])
    queue.push(path)
    if (!timer) timer = setTimeout(flush, 30)
  })
  pending.set(path, prom)
  return prom
}

export function cachedUrl(path: string) {
  const hit = cache.get(path)
  return hit && hit.exp > Date.now() ? hit.url : null
}

export async function downloadImage(path: string, fileName: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw error || new Error('تعذّر التنزيل')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(data)
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export async function uploadImage(path: string, blob: Blob, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false, cacheControl: '31536000' })
  if (error) {
    const m = error.message || ''
    if (/row-level security|Unauthorized|403/i.test(m)) throw new Error('لا يمكن رفع الصورة: المحادثة مغلقة أو انتهت جلستك')
    if (/mime|type/i.test(m)) throw new Error('صيغة الصورة غير مسموحة')
    if (/size|large/i.test(m)) throw new Error('حجم الصورة أكبر من المسموح (5 ميجابايت)')
    throw new Error('تعذّر رفع الصورة، حاول مجددًا')
  }
}

export async function uploadAudio(path: string, blob: Blob, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false, cacheControl: '31536000' })
  if (error) {
    const m = error.message || ''
    if (/row-level security|Unauthorized|403/i.test(m)) throw new Error('لا يمكن رفع التسجيل: المحادثة مغلقة أو انتهت جلستك')
    if (/mime|type/i.test(m)) throw new Error('صيغة التسجيل غير مدعومة على هذا الجهاز')
    if (/size|large/i.test(m)) throw new Error('التسجيل أطول من المسموح')
    throw new Error('تعذّر رفع التسجيل، حاول مجددًا')
  }
}
