import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, KeyRound, Globe2, ArrowLeft, BookCopy } from 'lucide-react'
import { Modal, Spinner, toast } from './ui'
import { SharePanel } from './SharePanel'
import { addRoster, createConversation, templates } from '../lib/teacherApi'
import { errorMessage } from '../lib/supabase'
import type { AccessMode, ConversationRow, TemplateRow } from '../lib/types'

export const GRADES = ['الصف الأول', 'الصف الثاني', 'الصف الثالث', 'الصف الرابع', 'الصف الخامس', 'الصف السادس',
  'الأول المتوسط', 'الثاني المتوسط', 'الثالث المتوسط', 'الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي']

export function NewConversationModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [grade, setGrade] = useState('')
  const [openToAll, setOpenToAll] = useState(true)
  const [restrict, setRestrict] = useState<AccessMode>('code')
  const [names, setNames] = useState('')
  const [hasExpiry, setHasExpiry] = useState(false)
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState<ConversationRow | null>(null)
  const [tpls, setTpls] = useState<TemplateRow[]>([])
  const [tplId, setTplId] = useState('')
  useEffect(() => { if (open) templates().then(setTpls).catch(() => setTpls([])) }, [open])
  const pickTemplate = (id: string) => {
    setTplId(id)
    const t = tpls.find((x) => x.id === id)
    if (t) { setTitle(t.title); setDesc(t.description || ''); setGrade(t.grade || '') }
  }

  const reset = () => {
    setTitle(''); setDesc(''); setGrade(''); setOpenToAll(true); setRestrict('code'); setNames(''); setHasExpiry(false); setExpiry(''); setErr(null); setCreated(null); setTplId('')
  }
  const close = () => { reset(); onClose() }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (title.trim().length < 2) { setErr('اكتب اسم الدرس'); return }
    const nameList = names.split(/\n|،|,/).map((s) => s.trim()).filter(Boolean)
    if (!openToAll && nameList.length === 0) { setErr('أضف أسماء الطلاب (اسم في كل سطر)، أو اجعل المحادثة مفتوحة'); return }
    let expires_at: string | null = null
    if (hasExpiry) {
      if (!expiry) { setErr('حدد وقت انتهاء المحادثة'); return }
      const d = new Date(expiry)
      if (d.getTime() <= Date.now()) { setErr('وقت الانتهاء يجب أن يكون في المستقبل'); return }
      expires_at = d.toISOString()
    }
    setBusy(true)
    try {
      const c = await createConversation({
        title: title.trim(), description: desc.trim() || null, grade: grade || null,
        access_mode: openToAll ? 'open' : restrict, expires_at, template_id: tplId || null,
      })
      if (!openToAll) await addRoster(c.id, nameList)
      setCreated(c)
      onCreated()
      toast.ok('تم إنشاء المحادثة')
    } catch (e2) { setErr(errorMessage(e2)) } finally { setBusy(false) }
  }

  if (created) {
    return (
      <Modal open={open} onClose={close} title="المحادثة جاهزة 🎉"
        footer={<div className="flex gap-2 pb-2">
          <button className="btn-primary flex-1" onClick={() => { const id = created.id; reset(); onClose(); nav(`/t/c/${id}`) }}>فتح المحادثة <ArrowLeft className="h-5 w-5" /></button>
          <button className="btn-outline" onClick={close}>إغلاق</button>
        </div>}>
        <div className="mb-4 rounded-2xl bg-navy-50 p-4">
          <div className="text-lg font-bold">{created.title}</div>
          {created.access_mode !== 'open' && (
            <div className="mt-1 text-sm text-navy-600">
              {created.access_mode === 'code' ? 'رموز الدخول الفردية تجدها داخل المحادثة ← «الطلاب والرموز».' : 'سيدخل فقط الطلاب المسجلة أسماؤهم.'}
            </div>
          )}
        </div>
        <SharePanel slug={created.slug} title={created.title} />
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={close} title="إنشاء محادثة جديدة"
      footer={<div className="pb-2"><button form="newconv" className="btn-primary w-full py-3 text-lg" disabled={busy}>{busy && <Spinner className="h-5 w-5" />} إنشاء المحادثة</button></div>}>
      <form id="newconv" onSubmit={submit} className="space-y-4">
        {tpls.length > 0 && (
          <div className="rounded-2xl bg-gold-50 p-3">
            <label className="label flex items-center gap-1.5" htmlFor="tp"><BookCopy className="h-4 w-4 text-gold-600" /> ابدأ من قالب (اختياري)</label>
            <select id="tp" className="input" value={tplId} onChange={(e) => pickTemplate(e.target.value)}>
              <option value="">— بدون قالب —</option>
              {tpls.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.items.length} سؤال)</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="t">اسم الدرس *</label>
          <input id="t" className="input" placeholder="مثال: التوكل على الله" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="d">وصف مختصر (اختياري)</label>
          <textarea id="d" className="input min-h-[72px]" placeholder="ما المطلوب من الطلاب في هذه المحادثة؟" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
        </div>
        <div>
          <label className="label" htmlFor="g">الصف الدراسي</label>
          <select id="g" className="input" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">— اختر الصف —</option>
            {GRADES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>

        <div className="space-y-2 rounded-2xl border border-navy-100 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-semibold"><Globe2 className="h-5 w-5 text-mint-600" /> مفتوحة لجميع من يملك الرابط</span>
            <input type="checkbox" className="h-6 w-6 accent-navy-800" checked={openToAll} onChange={(e) => setOpenToAll(e.target.checked)} />
          </label>
          {openToAll ? (
            <p className="text-xs leading-5 text-navy-500">يدخل الطالب باسمه فقط. لا يُسمح بتكرار اسم مستخدم في المحادثة نفسها.</p>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setRestrict('code')} className={`rounded-xl border p-3 text-start text-sm ${restrict === 'code' ? 'border-navy-700 bg-navy-50 ring-2 ring-navy-200' : 'border-navy-100'}`}>
                  <KeyRound className="mb-1 h-5 w-5 text-gold-500" /><div className="font-bold">رموز دخول فردية</div><div className="text-xs text-navy-500">الأكثر أمانًا: اسم + رمز سري لكل طالب</div>
                </button>
                <button type="button" onClick={() => setRestrict('roster')} className={`rounded-xl border p-3 text-start text-sm ${restrict === 'roster' ? 'border-navy-700 bg-navy-50 ring-2 ring-navy-200' : 'border-navy-100'}`}>
                  <Users className="mb-1 h-5 w-5 text-navy-500" /><div className="font-bold">قائمة أسماء</div><div className="text-xs text-navy-500">يدخل فقط من اسمه في القائمة</div>
                </button>
              </div>
              <div>
                <label className="label" htmlFor="n">أسماء الطلاب (اسم في كل سطر)</label>
                <textarea id="n" className="input min-h-[110px]" placeholder={'أحمد علي\nمحمد خالد'} value={names} onChange={(e) => setNames(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-2xl border border-navy-100 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="font-semibold">تحديد وقت انتهاء المحادثة</span>
            <input type="checkbox" className="h-6 w-6 accent-navy-800" checked={hasExpiry} onChange={(e) => setHasExpiry(e.target.checked)} />
          </label>
          {hasExpiry && <input type="datetime-local" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />}
        </div>
        {err && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{err}</div>}
      </form>
    </Modal>
  )
}

export function ProfileModal({ open, onSaved, initial }: { open: boolean; onSaved: () => void; initial?: string }) {
  const [name, setName] = useState(initial || '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (name.trim().length < 2) return
    setBusy(true)
    const { supabase } = await import('../lib/supabase')
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase.from('tw_teachers').upsert({ id: u.user!.id, display_name: name.trim().slice(0, 60) })
    setBusy(false)
    if (error) toast.err(errorMessage(error)); else { toast.ok('تم الحفظ'); onSaved() }
  }
  return (
    <Modal open={open} onClose={() => initial && onSaved()} title="اسمك كما يظهر للطلاب">
      <p className="mb-3 text-sm text-navy-500">يظهر هذا الاسم في شاشة دخول الطلاب وبجانب رسائلك.</p>
      <input className="input mb-4" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أ. حسن" maxLength={60} autoFocus />
      <button className="btn-primary mb-2 w-full" onClick={save} disabled={busy || name.trim().length < 2}>{busy && <Spinner className="h-5 w-5" />} حفظ</button>
    </Modal>
  )
}
