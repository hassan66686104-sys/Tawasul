/** دخول المعلم برمز مرور فقط: يُشتق من الرمز معرّف داخلي (لا يُرسل إليه بريد) وكلمة مرور */
export const MIN_PASSCODE = 8

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function normalizePasscode(raw: string) {
  // توحيد الأرقام العربية/الفارسية إلى لاتينية وإزالة المسافات
  return raw.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/\s+/g, '')
}

export async function passcodeCredentials(raw: string) {
  const code = normalizePasscode(raw)
  const h = await sha256Hex(`tawasul-teacher:${code}`)
  return { email: `t${h.slice(0, 40)}@teachers.tawasul.invalid`, password: `tw#${code}` }
}
