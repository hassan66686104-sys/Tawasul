import { supabase } from './supabase'
import type { ConvInfo, Msg, StudentSession } from './types'

function rpcError(e: { message?: string; code?: string } | null): Error {
  const err = new Error(e?.message || 'حدث خطأ، حاول مجددًا') as Error & { code?: string }
  err.code = e?.code
  if (/Failed to fetch|NetworkError/i.test(err.message)) err.message = 'تعذّر الاتصال، تحقق من الإنترنت'
  return err
}
async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw rpcError(error)
  return data as T
}

export interface PublicConv { title: string; description: string | null; grade: string | null; access_mode: 'open' | 'roster' | 'code'; status: string; teacher_name: string }

export const studentApi = {
  publicInfo: (slug: string) => call<PublicConv | null>('tw_conv_public', { p_slug: slug }),
  join: (slug: string, name: string, code?: string) => call<StudentSession>('tw_join', { p_slug: slug, p_name: name, p_code: code || null }),
  resume: (token: string) => call<StudentSession>('tw_resume', { p_token: token }),
  feed: (token: string, since: string | null) =>
    call<{ server_time: string; conversation: ConvInfo; me: { id: string; name: string; is_blocked: boolean }; messages: Msg[] }>('tw_feed', { p_token: token, p_since: since }),
  send: (token: string, body: string | null, imagePath: string | null, replyTo: string | null) =>
    call<Msg>('tw_send', { p_token: token, p_body: body, p_image_path: imagePath, p_reply_to: replyTo }),
  deleteOwn: (token: string, id: string) => call<void>('tw_delete_own', { p_token: token, p_message_id: id }),
  report: (token: string, id: string, reason?: string) => call<void>('tw_report', { p_token: token, p_message_id: id, p_reason: reason || null }),
}

const KEY = (slug: string) => `tw_student_${slug}`
export const studentStore = {
  get(slug: string): { token: string; name: string } | null {
    try { return JSON.parse(localStorage.getItem(KEY(slug)) || 'null') } catch { return null }
  },
  set(slug: string, v: { token: string; name: string }) { try { localStorage.setItem(KEY(slug), JSON.stringify(v)) } catch { /* وضع التصفح الخاص */ } },
  clear(slug: string) { try { localStorage.removeItem(KEY(slug)) } catch { /* */ } },
  lastName(): string { try { return localStorage.getItem('tw_last_name') || '' } catch { return '' } },
  setLastName(n: string) { try { localStorage.setItem('tw_last_name', n) } catch { /* */ } },
}
