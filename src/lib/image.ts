// التحقق من الصور وضغطها قبل الرفع (يزيل بيانات EXIF مثل الموقع الجغرافي)
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif'
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif|heic|heif)$/i
export const MAX_INPUT_BYTES = 15 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const MAX_SIDE = 1600

export interface PreparedImage { blob: Blob; ext: 'jpg' | 'gif' | 'png'; type: string; url: string; width: number; height: number }

export function validateImageFile(f: File): string | null {
  const t = (f.type || '').toLowerCase()
  const typeOk = t ? ALLOWED.includes(t) : ALLOWED_EXT.test(f.name || '')
  if (!typeOk) return 'يُسمح بالصور فقط (JPG أو PNG أو WEBP أو GIF)'
  if (f.size > MAX_INPUT_BYTES) return 'حجم الصورة كبير جدًا (الحد 15 ميجابايت قبل الضغط)'
  return null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('تعذّر قراءة الصورة، جرّب صورة بصيغة أخرى'))
    img.src = src
  })
}

async function sniffIsImage(blob: Blob): Promise<boolean> {
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  const ascii = String.fromCharCode(...b)
  return hex.startsWith('ffd8ff') || hex.startsWith('89504e47') || ascii.startsWith('GIF8') ||
    (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') || ascii.slice(4, 8) === 'ftyp'
}

export async function prepareImage(input: Blob): Promise<PreparedImage> {
  if (!(await sniffIsImage(input))) throw new Error('الملف ليس صورة صالحة')
  const type = (input.type || '').toLowerCase()
  const srcUrl = URL.createObjectURL(input)
  try {
    const img = await loadImage(srcUrl)
    const w0 = img.naturalWidth, h0 = img.naturalHeight
    // GIF المتحركة الصغيرة تُرفع كما هي
    if (type === 'image/gif' && input.size <= MAX_UPLOAD_BYTES) {
      return { blob: input, ext: 'gif', type: 'image/gif', url: URL.createObjectURL(input), width: w0, height: h0 }
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0))
    const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    let q = 0.85
    let blob: Blob | null = null
    for (let i = 0; i < 5; i++) {
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q))
      if (blob && blob.size <= MAX_UPLOAD_BYTES) break
      q -= 0.15
    }
    if (!blob) throw new Error('تعذّر تجهيز الصورة')
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('حجم الصورة كبير جدًا')
    return { blob, ext: 'jpg', type: 'image/jpeg', url: URL.createObjectURL(blob), width: w, height: h }
  } finally {
    URL.revokeObjectURL(srcUrl)
  }
}
