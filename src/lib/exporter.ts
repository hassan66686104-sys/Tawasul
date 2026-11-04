import { supabase, BUCKET } from './supabase'
import { fmtDateTime } from './format'
import type { ConversationRow, MessageRow, ParticipantRow } from './types'

export async function exportExcel(conv: ConversationRow, messages: MessageRow[], parts: ParticipantRow[]) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const paths = messages.filter((m) => m.image_path && !m.deleted_at).map((m) => m.image_path!)
  const links = new Map<string, string>()
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 7 * 24 * 3600)
    data?.forEach((d) => d.path && d.signedUrl && links.set(d.path, d.signedUrl))
  }
  const H = (v: string) => ({ value: v, fontWeight: 'bold' as const, backgroundColor: '#13233f', textColor: '#ffffff', align: 'center' as const })
  const msgSheet = [
    [H('التاريخ والوقت'), H('المرسل'), H('الدور'), H('الرسالة'), H('صورة (رابط صالح 7 أيام)'), H('إجابة مميزة'), H('مثبّتة'), H('إعلان'), H('الحالة')],
    ...messages.map((m) => [
      { value: fmtDateTime(m.created_at) },
      { value: m.sender_name },
      { value: m.sender_role === 'teacher' ? 'المعلم' : 'طالب' },
      { value: m.deleted_at ? '' : m.body || '', wrap: true },
      { value: m.image_path && !m.deleted_at ? links.get(m.image_path) || m.image_path : '' },
      { value: m.is_featured ? 'نعم' : '' },
      { value: m.is_pinned ? 'نعم' : '' },
      { value: m.is_announcement ? 'نعم' : '' },
      { value: m.deleted_at ? (m.deleted_by === 'teacher' ? 'حذفها المعلم' : 'حذفها الطالب') : '' },
    ]),
  ]
  const counts = new Map<string, number>()
  messages.forEach((m) => m.participant_id && !m.deleted_at && counts.set(m.participant_id, (counts.get(m.participant_id) || 0) + 1))
  const partSheet = [
    [H('اسم الطالب'), H('وقت الدخول'), H('آخر نشاط'), H('عدد الرسائل'), H('الحالة')],
    ...parts.map((p) => [
      { value: p.name }, { value: fmtDateTime(p.joined_at) }, { value: fmtDateTime(p.last_seen_at) },
      { value: counts.get(p.id) || 0 }, { value: p.is_blocked ? 'موقوف' : 'مشارك' },
    ]),
  ]
  const info = [
    [H('البيان'), H('القيمة')],
    [{ value: 'الدرس' }, { value: conv.title }],
    [{ value: 'الوصف' }, { value: conv.description || '' }],
    [{ value: 'الصف' }, { value: conv.grade || '' }],
    [{ value: 'تاريخ الإنشاء' }, { value: fmtDateTime(conv.created_at) }],
    [{ value: 'عدد الطلاب' }, { value: parts.length }],
    [{ value: 'عدد الرسائل' }, { value: messages.filter((m) => !m.deleted_at).length }],
    [{ value: 'تاريخ التصدير' }, { value: fmtDateTime(new Date().toISOString()) }],
  ]
  const safe = conv.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60)
  await writeExcelFile([
    { data: msgSheet as never, sheet: 'الرسائل', rightToLeft: true, stickyRowsCount: 1, columns: [{ width: 22 }, { width: 20 }, { width: 10 }, { width: 60 }, { width: 40 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 14 }] },
    { data: partSheet as never, sheet: 'الطلاب', rightToLeft: true, stickyRowsCount: 1, columns: [{ width: 24 }, { width: 22 }, { width: 22 }, { width: 12 }, { width: 12 }] },
    { data: info as never, sheet: 'معلومات الدرس', rightToLeft: true, columns: [{ width: 18 }, { width: 50 }] },
  ] as never, { fontFamily: 'Arial' } as never).toFile(`محادثة - ${safe}.xlsx`)
}
