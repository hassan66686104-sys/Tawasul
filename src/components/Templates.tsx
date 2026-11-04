import { useEffect, useState } from 'react'
import { BarChart3, BookCopy, MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import * as api from '../lib/teacherApi'
import { errorMessage } from '../lib/supabase'
import type { TemplateItem, TemplateRow } from '../lib/types'
import { confirmDialog, Empty, Modal, Spinner, toast } from './ui'
import { GRADES } from './NewConversation'

/** إدارة قوالب الدروس: أسئلة وتصويتات جاهزة تُستخدم مع أي فصل */
export function TemplatesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [list, setList] = useState<TemplateRow[] | null>(null)
  const [edit, setEdit] = useState<Partial<TemplateRow> | null>(null)
  const load = () => api.templates().then(setList).catch((e) => { toast.err(errorMessage(e)); setList([]) })
  useEffect(() => { if (open) { setList(null); load() } }, [open])

  if (edit) return <TemplateEditor open={open} initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><BookCopy className="h-5 w-5 text-gold-500" /> قوالب الدروس</span>}
      footer={<div className="pb-2"><button className="btn-primary w-full" onClick={() => setEdit({ title: '', items: [] })}><Plus className="h-5 w-5" /> قالب جديد</button></div>}>
      <p className="mb-3 text-sm leading-6 text-navy-500">احفظ أسئلة الدرس مرة واحدة، ثم استخدمها مع أي فصل: عند إنشاء محادثة اختر القالب، وستجد الأسئلة جاهزة للإرسال بضغطة من «أسئلة جاهزة».</p>
      {list === null ? <Spinner className="mx-auto h-6 w-6" /> : list.length === 0 ? (
        <Empty icon={<BookCopy className="h-8 w-8" />} title="لا توجد قوالب بعد" text="أنشئ قالبًا جديدًا، أو احفظ أي محادثة كقالب من قائمة ⋮ داخلها." />
      ) : (
        <ul className="space-y-2 pb-2">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl border border-navy-100 p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{t.title}</div>
                <div className="text-xs text-navy-500">{t.grade || '—'} · {t.items.length} سؤال</div>
              </div>
              <button className="icon-btn" onClick={() => setEdit(t)} aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
              <button className="icon-btn text-red-500" aria-label="حذف" onClick={async () => {
                if (!(await confirmDialog({ title: `حذف قالب «${t.title}»؟`, text: 'لن تتأثر المحادثات التي أُنشئت منه.', confirm: 'حذف', danger: true }))) return
                try { await api.deleteTemplate(t.id); load() } catch (e) { toast.err(errorMessage(e)) }
              }}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

function TemplateEditor({ open, initial, onClose, onSaved }: { open: boolean; initial: Partial<TemplateRow>; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial.title || '')
  const [desc, setDesc] = useState(initial.description || '')
  const [grade, setGrade] = useState(initial.grade || '')
  const [items, setItems] = useState<TemplateItem[]>(initial.items || [])
  const [busy, setBusy] = useState(false)
  const upd = (i: number, p: Partial<TemplateItem>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const save = async () => {
    if (title.trim().length < 2) { toast.err('اكتب اسم الدرس'); return }
    const clean = items.map((it) => ({ ...it, body: it.body.trim(), options: it.type === 'poll' ? (it.options || []).map((o) => o.trim()).filter(Boolean) : undefined }))
      .filter((it) => it.body)
    if (clean.some((it) => it.type === 'poll' && (it.options?.length || 0) < 2)) { toast.err('كل سؤال باختيارات يحتاج اختيارين على الأقل'); return }
    setBusy(true)
    try { await api.saveTemplate({ id: initial.id, title: title.trim(), description: desc.trim() || null, grade: grade || null, items: clean }); toast.ok('حُفظ القالب'); onSaved() }
    catch (e) { toast.err(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial.id ? 'تعديل القالب' : 'قالب جديد'}
      footer={<div className="flex gap-2 pb-2"><button className="btn-primary flex-1" onClick={save} disabled={busy}>{busy && <Spinner className="h-5 w-5" />} حفظ القالب</button><button className="btn-outline" onClick={onClose}>رجوع</button></div>}>
      <div className="space-y-3">
        <div><label className="label">اسم الدرس</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="مثال: التوكل على الله" /></div>
        <div><label className="label">الوصف (اختياري)</label><textarea className="input min-h-[60px]" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} /></div>
        <div><label className="label">الصف</label>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">—</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></div>
        <div className="space-y-2">
          <label className="label">أسئلة الدرس</label>
          {items.map((it, i) => (
            <div key={i} className="space-y-2 rounded-2xl border border-navy-100 p-3">
              <div className="flex items-center gap-2 text-xs font-bold text-navy-500">
                {it.type === 'poll' ? <><BarChart3 className="h-4 w-4" /> سؤال باختيارات</> : <><MessageCircle className="h-4 w-4" /> سؤال مفتوح / إعلان</>}
                <button className="icon-btn ms-auto h-7 w-7 text-red-500" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="حذف السؤال"><X className="h-4 w-4" /></button>
              </div>
              <textarea className="input min-h-[56px]" value={it.body} onChange={(e) => upd(i, { body: e.target.value })} maxLength={1000} placeholder="نص السؤال" />
              {it.type === 'poll' && (
                <div className="space-y-1.5">
                  {(it.options || []).map((o, k) => (
                    <div key={k} className="flex gap-2">
                      <input className="input py-2" value={o} maxLength={120} placeholder={`الاختيار ${k + 1}`} onChange={(e) => upd(i, { options: (it.options || []).map((x, z) => (z === k ? e.target.value : x)) })} />
                      {(it.options || []).length > 2 && <button className="icon-btn text-red-500" onClick={() => upd(i, { options: (it.options || []).filter((_, z) => z !== k) })} aria-label="حذف"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  ))}
                  {(it.options || []).length < 6 && <button className="btn-ghost w-full py-1.5 text-sm" onClick={() => upd(i, { options: [...(it.options || []), ''] })}><Plus className="h-4 w-4" /> اختيار</button>}
                </div>
              )}
            </div>
          ))}
          {items.length < 40 && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-outline py-2 text-sm" onClick={() => setItems([...items, { type: 'text', body: '' }])}><MessageCircle className="h-4 w-4" /> سؤال مفتوح</button>
              <button className="btn-outline py-2 text-sm" onClick={() => setItems([...items, { type: 'poll', body: '', options: ['', ''] }])}><BarChart3 className="h-4 w-4" /> سؤال باختيارات</button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
