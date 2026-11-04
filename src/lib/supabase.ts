import { createClient } from '@supabase/supabase-js'

// القيم الافتراضية: رابط المشروع والمفتاح العام فقط (ليست أسرارًا؛ الحماية في RLS)
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://pqkaotqtwdaoolbjzpyk.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_6TUp8IMl-Br4lmWOxZ-JHQ_hVFHr85v'

export const isConfigured = Boolean(url && key)

// المفتاح المستخدم هنا هو المفتاح العام فقط (anon/publishable)؛ الحماية الفعلية عبر RLS ودوال RPC
export const supabase = createClient(url || 'https://example.supabase.co', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'tw-teacher-auth' },
  realtime: { params: { eventsPerSecond: 10 } },
})

export const BUCKET = 'tw-images'

export function errorMessage(e: unknown): string {
  const anyE = e as { message?: string; error_description?: string } | null
  const msg = anyE?.message || anyE?.error_description || String(e ?? '')
  const map: Record<string, string> = {
    'Invalid login credentials': 'رمز المرور غير صحيح',
    'Email not confirmed': 'لم يتم تأكيد البريد الإلكتروني بعد، افتح رسالة التأكيد في بريدك',
    'User already registered': 'هذا الرمز مستخدم مسبقًا، اختر رمزًا آخر أو ادخل به',
    'Failed to fetch': 'تعذّر الاتصال بالخادم، تحقق من الإنترنت',
    'Password should be at least 6 characters.': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
  }
  for (const k of Object.keys(map)) if (msg.includes(k)) return map[k]
  if (/rate limit/i.test(msg)) return 'محاولات كثيرة، انتظر قليلًا ثم أعد المحاولة'
  if (/JWT|token/i.test(msg) && /expired/i.test(msg)) return 'انتهت الجلسة، سجّل الدخول من جديد'
  return msg || 'حدث خطأ غير متوقع'
}
