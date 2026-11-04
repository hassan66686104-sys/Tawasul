import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Printer, FileSpreadsheet, Star, Megaphone } from 'lucide-react'
import * as api from '../lib/teacherApi'
import { supabase, BUCKET, errorMessage } from '../lib/supabase'
import { exportExcel } from '../lib/exporter'
import { fmtDateTime, fmtDate, ACCESS_LABEL } from '../lib/format'
import { FullLoader, toast } from '../components/ui'
import type { ConversationRow, MessageRow, ParticipantRow } from '../lib/types'

/** صفحة مهيأة للطباعة والحفظ كملف PDF (تدعم العربية والصور بدقة كاملة) */
export default function ExportPrint() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [conv, setConv] = useState<ConversationRow | null>(null)
  const [msgs, setMsgs] = useState<MessageRow[]>([])
  const [parts, setParts] = useState<ParticipantRow[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [c, m, p] = await Promise.all([api.getConversation(id), api.messagesSince(id, null), api.participants(id)])
        setConv(c); setMsgs(m.filter((x) => !x.deleted_at)); setParts(p)
        const paths = m.filter((x) => x.image_path && !x.deleted_at).map((x) => x.image_path!)
        if (paths.length) {
          const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
          setUrls(new Map((data || []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string])))
        }
        setReady(true)
      } catch (e) { toast.err(errorMessage(e)) }
    })()
  }, [id])

  if (!conv || !ready) return <FullLoader text="جارٍ تجهيز ملف التصدير…" />
  const byId = new Map(msgs.map((m) => [m.id, m]))

  return (
    <div className="min-h-full bg-navy-50 print:bg-white">
      <div className="no-print pt-safe sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-navy-900 px-4 py-3 text-white">
        <button className="icon-btn text-white hover:bg-white/10" onClick={() => nav(`/t/c/${id}`)} aria-label="رجوع"><ArrowRight className="h-6 w-6" /></button>
        <span className="flex-1 font-bold">تصدير المحادثة</span>
        <button className="btn-gold" onClick={() => window.print()}><Printer className="h-5 w-5" /> طباعة / حفظ PDF</button>
        <button className="btn bg-white/10 text-white hover:bg-white/20" onClick={() => exportExcel(conv, msgs, parts).then(() => toast.ok('تم تنزيل ملف Excel'))}><FileSpreadsheet className="h-5 w-5" /> Excel</button>
        <p className="w-full text-xs text-navy-200">لحفظ PDF: اضغط «طباعة» ثم اختر «حفظ كملف PDF» كوجهة الطباعة.</p>
      </div>
      <article className="mx-auto max-w-3xl bg-white p-6 shadow-soft print:max-w-none print:p-0 print:shadow-none sm:my-6 sm:rounded-2xl sm:p-10">
        <header className="mb-6 border-b-4 border-gold-400 pb-4">
          <div className="text-sm font-bold text-gold-600">تواصل – مساحة التعلم</div>
          <h1 className="mt-1 text-3xl font-extrabold text-navy-900">{conv.title}</h1>
          {conv.description && <p className="mt-1 text-navy-600">{conv.description}</p>}
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-navy-700 sm:grid-cols-4">
            <div><b>الصف:</b> {conv.grade || '—'}</div>
            <div><b>التاريخ:</b> {fmtDate(conv.created_at)}</div>
            <div><b>الطلاب:</b> {parts.length}</div>
            <div><b>الرسائل:</b> {msgs.length}</div>
          </div>
          <div className="mt-1 text-xs text-navy-500">طريقة الدخول: {ACCESS_LABEL[conv.access_mode]} · تاريخ التصدير: {fmtDateTime(new Date().toISOString())}</div>
        </header>

        <section className="mb-6 break-inside-avoid">
          <h2 className="mb-2 text-lg font-bold">الطلاب المشاركون</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {parts.length ? parts.map((p) => <span key={p.id} className="rounded-lg border border-navy-100 px-2 py-1">{p.name} <span className="text-xs text-navy-400">({fmtDateTime(p.joined_at)})</span></span>) : '—'}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-bold">الرسائل</h2>
          <div className="space-y-3">
            {msgs.map((m) => {
              const rep = m.reply_to ? byId.get(m.reply_to) : null
              return (
                <div key={m.id} className={`break-inside-avoid rounded-xl border p-3 ${m.sender_role === 'teacher' ? 'border-navy-200 bg-navy-50' : 'border-navy-100'} ${m.is_featured ? 'border-gold-400 ring-1 ring-gold-300' : ''}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                    <b className="text-navy-900">{m.sender_name}</b>
                    {m.sender_role === 'teacher' && <span className="rounded bg-navy-800 px-1.5 text-[11px] text-white">المعلم</span>}
                    {m.is_announcement && <span className="flex items-center gap-1 text-xs font-bold text-gold-600"><Megaphone className="h-3.5 w-3.5" /> إعلان</span>}
                    {m.is_featured && <span className="flex items-center gap-1 text-xs font-bold text-gold-600"><Star className="h-3.5 w-3.5 fill-current" /> إجابة مميزة</span>}
                    <span className="ms-auto text-xs text-navy-500">{fmtDateTime(m.created_at)}</span>
                  </div>
                  {rep && <div className="mb-1 border-s-4 border-navy-200 ps-2 text-xs text-navy-500">ردًا على {rep.sender_name}: {rep.body?.slice(0, 100) || '📷 صورة'}</div>}
                  {m.body && <p className="whitespace-pre-wrap leading-7">{m.body}</p>}
                  {m.image_path && urls.get(m.image_path) && <img src={urls.get(m.image_path)} alt={`صورة من ${m.sender_name}`} className="mt-2 max-h-[420px] max-w-full rounded-lg border border-navy-100" />}
                </div>
              )
            })}
          </div>
        </section>
      </article>
    </div>
  )
}
