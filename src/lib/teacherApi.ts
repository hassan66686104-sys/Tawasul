import { supabase, BUCKET } from './supabase'
import type { ConversationRow, DashboardRow, MessageRow, Msg, ParticipantRow, ReportRow, RosterRow, AccessMode } from './types'

function check<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error
  return r.data as T
}

export async function dashboard(): Promise<DashboardRow[]> {
  return check(await supabase.rpc('tw_dashboard')) as DashboardRow[]
}

export async function createConversation(input: {
  title: string; description?: string | null; grade?: string | null; access_mode: AccessMode; expires_at?: string | null
}): Promise<ConversationRow> {
  return check(await supabase.from('tw_conversations').insert(input).select('*').single())
}

export async function getConversation(id: string): Promise<ConversationRow> {
  return check(await supabase.from('tw_conversations').select('*').eq('id', id).single())
}

export async function updateConversation(id: string, patch: Partial<Pick<ConversationRow,
  'title' | 'description' | 'grade' | 'access_mode' | 'is_closed' | 'is_archived' | 'expires_at' | 'teacher_last_read_at'>>) {
  check(await supabase.from('tw_conversations').update(patch).eq('id', id).select('id'))
}

export async function deleteConversation(id: string) {
  const c = await getConversation(id)
  // حذف كل الصور التابعة للمحادثة من التخزين أولًا
  const top = await supabase.storage.from(BUCKET).list(c.secret_key, { limit: 1000 })
  const paths: string[] = []
  for (const folder of top.data || []) {
    const inner = await supabase.storage.from(BUCKET).list(`${c.secret_key}/${folder.name}`, { limit: 1000 })
    for (const f of inner.data || []) paths.push(`${c.secret_key}/${folder.name}/${f.name}`)
  }
  for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100))
  check(await supabase.from('tw_conversations').delete().eq('id', id).select('id'))
}

export async function messagesSince(convId: string, since: string | null): Promise<MessageRow[]> {
  let q = supabase.from('tw_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true }).limit(5000)
  if (since) q = q.gt('updated_at', since)
  return check(await q) as MessageRow[]
}

export async function participants(convId: string): Promise<ParticipantRow[]> {
  return check(await supabase.from('tw_participants').select('*').eq('conversation_id', convId).order('joined_at')) as ParticipantRow[]
}

export async function reports(convId: string): Promise<ReportRow[]> {
  return check(await supabase.from('tw_reports').select('*').eq('conversation_id', convId).eq('resolved', false)) as ReportRow[]
}

export async function resolveReports(messageId: string) {
  check(await supabase.from('tw_reports').update({ resolved: true }).eq('message_id', messageId).select('id'))
}

export async function sendTeacherMessage(input: { conversation_id: string; body: string | null; image_path?: string | null; reply_to?: string | null; is_announcement?: boolean }) {
  return check(await supabase.from('tw_messages').insert({ ...input, sender_role: 'teacher' }).select('*').single()) as MessageRow
}

export async function patchMessage(id: string, patch: Partial<Pick<MessageRow, 'is_pinned' | 'is_featured' | 'deleted_at' | 'deleted_by'>>) {
  check(await supabase.from('tw_messages').update(patch).eq('id', id).select('id'))
}

export async function setBlocked(participantId: string, blocked: boolean) {
  check(await supabase.from('tw_participants').update({ is_blocked: blocked }).eq('id', participantId).select('id'))
}

export async function roster(convId: string): Promise<RosterRow[]> {
  return check(await supabase.from('tw_roster').select('*').eq('conversation_id', convId).order('created_at')) as RosterRow[]
}

export async function addRoster(convId: string, names: string[]) {
  const existing = new Set((await roster(convId)).map((r) => normalize(r.name)))
  const rows = [...new Set(names.map((n) => n.replace(/\s+/g, ' ').trim()).filter((n) => n.length >= 2 && n.length <= 40))]
    .filter((n) => !existing.has(normalize(n)))
    .map((name) => ({ conversation_id: convId, name, name_norm: normalize(name), code: '' }))
  if (!rows.length) return 0
  check(await supabase.from('tw_roster').insert(rows).select('id'))
  return rows.length
}

export async function removeRoster(id: string) {
  check(await supabase.from('tw_roster').delete().eq('id', id).select('id'))
}

export async function regenerateCode(id: string) {
  check(await supabase.from('tw_roster').update({ code: '' }).eq('id', id).select('id'))
}

export async function seedDemo() { return check(await supabase.rpc('tw_seed_demo')) }
export async function clearDemo() { return check(await supabase.rpc('tw_clear_demo')) as number }

export function normalize(s: string) {
  return s.trim().replace(/[ً-ٰٟـ]/g, '').replace(/\s+/g, ' ')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').toLowerCase()
}

export function rowToMsg(r: MessageRow, byId: Map<string, MessageRow>, reportCounts?: Map<string, number>): Msg {
  const rep = r.reply_to ? byId.get(r.reply_to) : undefined
  if (r.deleted_at) {
    return { id: r.id, role: r.sender_role, participant_id: r.participant_id, name: r.sender_name, deleted: true, deleted_by: r.deleted_by,
      created_at: r.created_at, updated_at: r.updated_at, mine: r.sender_role === 'teacher' }
  }
  return {
    id: r.id, role: r.sender_role, participant_id: r.participant_id, name: r.sender_name, body: r.body, image_path: r.image_path,
    reply_to: r.reply_to,
    reply: rep ? { id: rep.id, name: rep.sender_name, body: rep.deleted_at ? null : rep.body?.slice(0, 140), has_image: !!rep.image_path && !rep.deleted_at } : null,
    is_announcement: r.is_announcement, is_pinned: r.is_pinned, is_featured: r.is_featured, deleted: false,
    created_at: r.created_at, updated_at: r.updated_at, mine: r.sender_role === 'teacher', report_count: reportCounts?.get(r.id) || 0,
  }
}
