import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Users, Search, Share2, Lock, Unlock, MoreVertical, FileDown, FileSpreadsheet, Archive, ArchiveRestore, Settings, X, Images, ShieldAlert, Ban, CheckCircle2, KeyRound, Trash2, RefreshCw, Printer, Wifi, WifiOff, MessageCircle } from 'lucide-react'
import { ChatView, MsgAction, SignedImage } from '../components/ChatView'
import { Composer, SendPayload } from '../components/Composer'
import { Lightbox, LightboxItem } from '../components/Lightbox'
import { SharePanel } from '../components/SharePanel'
import { confirmDialog, Empty, FullLoader, Modal, Spinner, StatusBadge, toast } from '../components/ui'
import * as api from '../lib/teacherApi'
import { useConversationSync } from '../lib/sync'
import { downloadImage, uploadImage } from '../lib/media'
import { exportExcel } from '../lib/exporter'
import { errorMessage } from '../lib/supabase'
import { ACCESS_LABEL, fmtDateTime, relative, uuid } from '../lib/format'
import { GRADES } from '../components/NewConversation'
import type { ConversationRow, MessageRow, Msg, ParticipantRow, ReportRow, RosterRow, AccessMode } from '../lib/types'

function statusOf(c: ConversationRow) {
  if (c.is_archived) return 'archived'
  if (c.is_closed) return 'closed'
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) return 'expired'
  return 'open'
}

export default function TeacherRoom() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [conv, setConv] = useState<ConversationRow | null>(null)
  const [rows, setRows] = useState<Map<string, MessageRow>>(new Map())
  const [parts, setParts] = useState<ParticipantRow[]>([])
  const [reps, setReps] = useState<ReportRow[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [panel, setPanel] = useState<null | 'students' | 'images' | 'reports' | 'settings'>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const since = useRef<string | null>(null)
  const unreadAfter = useRef<string | null>(null)
  const lastMark = useRef(0)

  const mergeRows = useCallback((list: MessageRow[]) => {
    if (!list.length) return
    setRows((prev) => {
      const next = new Map(prev)
      for (const r of list) next.set(r.id, r)
      return next
    })
    const maxU = list.reduce((a, r) => (r.updated_at > a ? r.updated_at : a), since.current || '')
    // تداخل بسيط في الوقت لضمان عدم تفويت أي رسالة
    since.current = new Date(new Date(maxU).getTime() - 5000).toISOString()
  }, [])

  const markRead = useCallback(async (force = false) => {
    if (document.hidden) return
    if (!force && Date.now() - lastMark.current < 4000) return
    lastMark.current = Date.now()
    try { await api.updateConversation(id, { teacher_last_read_at: new Date().toISOString() }) } catch { /* */ }
  }, [id])

  const loadAll = useCallback(async () => {
    try {
      const [c, m, p, r] = await Promise.all([api.getConversation(id), api.messagesSince(id, null), api.participants(id), api.reports(id)])
      if (!unreadAfter.current) unreadAfter.current = c.teacher_last_read_at
      setConv(c); setParts(p); setReps(r)
      setRows(new Map(m.map((x) => [x.id, x])))
      since.current = null
      mergeRows(m)
      markRead(true)
    } catch (e) { setLoadErr(errorMessage(e)) }
  }, [id, mergeRows, markRead])
  useEffect(() => { loadAll() }, [loadAll])

  const onSignal = useCallback(async (kind: string) => {
    try {
      if (kind === 'msg' || kind === 'all') { mergeRows(await api.messagesSince(id, since.current)); markRead() }
      if (kind === 'participant' || kind === 'all') setParts(await api.participants(id))
      if (kind === 'report' || kind === 'all') setReps(await api.reports(id))
      if (kind === 'conv' || kind === 'all') setConv(await api.getConversation(id))
    } catch { /* سيُعاد المحاولة تلقائيًا */ }
  }, [id, mergeRows, markRead])
  const syncState = useConversationSync(conv?.secret_key, onSignal)

  const reportCounts = useMemo(() => {
    const m = new Map<string, number>()
    reps.forEach((r) => m.set(r.message_id, (m.get(r.message_id) || 0) + 1))
    return m
  }, [reps])
  const messages = useMemo(() => {
    const list = [...rows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    return list.map((r) => api.rowToMsg(r, rows, reportCounts))
  }, [rows, reportCounts])
  const shown = useMemo(() => {
    const s = query.trim().toLowerCase()
    if (!s) return messages
    return messages.filter((m) => !m.deleted && ((m.body || '').toLowerCase().includes(s) || m.name.toLowerCase().includes(s)))
  }, [messages, query])
  const images = useMemo(() => messages.filter((m) => m.image_path && !m.deleted).reverse(), [messages])
  const msgCount = useMemo(() => {
    const c = new Map<string, number>()
    messages.forEach((m) => m.participant_id && !m.deleted && c.set(m.participant_id, (c.get(m.participant_id) || 0) + 1))
    return c
  }, [messages])

  if (loadErr) return <div className="p-6"><Empty icon={<ShieldAlert className="h-8 w-8" />} title="تعذّر فتح المحادثة" text={loadErr} action={<Link to="/t" className="btn-primary">العودة للوحة</Link>} /></div>
  if (!conv) return <FullLoader text="جارٍ تحميل المحادثة…" />
  const status = statusOf(conv)

  const send = async ({ text, image, replyTo: rt, announcement }: SendPayload) => {
    let image_path: string | null = null
    if (image) {
      image_path = `${conv.secret_key}/teacher/${uuid()}.${image.ext}`
      await uploadImage(image_path, image.blob, image.type)
    }
    const row = await api.sendTeacherMessage({ conversation_id: conv.id, body: text || null, image_path, reply_to: rt?.id || null, is_announcement: announcement })
    mergeRows([row])
  }

  const onAction = async (a: MsgAction, m: Msg) => {
    try {
      if (a === 'reply') setReplyTo(m)
      else if (a === 'pin' || a === 'unpin') { await api.patchMessage(m.id, { is_pinned: a === 'pin' }); toast.ok(a === 'pin' ? 'تم تثبيت الرسالة' : 'أُلغي التثبيت') }
      else if (a === 'feature' || a === 'unfeature') { await api.patchMessage(m.id, { is_featured: a === 'feature' }); toast.ok(a === 'feature' ? 'تم تمييزها كإجابة مميزة ⭐' : 'أُلغي التمييز') }
      else if (a === 'download' && m.image_path) await downloadImage(m.image_path, `${m.name}-${m.created_at.slice(0, 10)}.${m.image_path.split('.').pop()}`)
      else if (a === 'delete') {
        if (!(await confirmDialog({ title: 'حذف هذه الرسالة؟', text: `رسالة ${m.name} ستُخفى عن الجميع.`, confirm: 'حذف', danger: true }))) return
        await api.patchMessage(m.id, { deleted_at: new Date().toISOString(), deleted_by: 'teacher', is_pinned: false, is_featured: false })
        if (reportCounts.get(m.id)) await api.resolveReports(m.id)
        toast.ok('حُذفت الرسالة')
      }
      onSignal('msg'); if (a === 'delete') onSignal('report')
    } catch (e) { toast.err(errorMessage(e)) }
  }

  const toggleClosed = async () => {
    const closing = status === 'open'
    if (closing && !(await confirmDialog({ title: 'إغلاق المحادثة؟', text: 'لن يتمكن الطلاب من إرسال رسائل جديدة، وتبقى الرسائل محفوظة. يمكنك إعادة فتحها في أي وقت.', confirm: 'إغلاق' }))) return
    try {
      await api.updateConversation(conv.id, closing ? { is_closed: true } : { is_closed: false, is_archived: false, ...(status === 'expired' ? { expires_at: null } : {}) })
      toast.ok(closing ? 'أُغلقت المحادثة' : 'أُعيد فتح المحادثة')
      onSignal('conv')
    } catch (e) { toast.err(errorMessage(e)) }
  }
  const toggleArchive = async () => {
    setMenuOpen(false)
    try { await api.updateConversation(conv.id, { is_archived: !conv.is_archived }); toast.ok(conv.is_archived ? 'أُعيدت من الأرشيف' : 'تمت الأرشفة'); onSignal('conv') } catch (e) { toast.err(errorMessage(e)) }
  }
  const doExcel = async () => {
    setMenuOpen(false); setExporting(true)
    try { await exportExcel(conv, [...rows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)), parts); toast.ok('تم تنزيل ملف Excel') }
    catch (e) { toast.err(errorMessage(e)) } finally { setExporting(false) }
  }

  const openImage = (m: Msg) => m.image_path && setLightbox({ path: m.image_path, name: m.name, at: m.created_at })
  const activeCount = parts.filter((p) => !p.is_blocked).length

  const panelBody = panel && (
    <>
      {panel === 'students' && <StudentsPanel parts={parts} counts={msgCount} onChanged={() => onSignal('participant')} />}
      {panel === 'images' && (
        images.length === 0 ? <Empty icon={<Images className="h-8 w-8" />} title="لا توجد صور بعد" /> :
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
            {images.map((m) => (
              <button key={m.id} onClick={() => openImage(m)} className="overflow-hidden rounded-xl bg-navy-50 text-start ring-1 ring-navy-100">
                <SignedImage path={m.image_path!} alt={`صورة من ${m.name}`} className="aspect-square w-full object-cover" />
                <div className="px-2 py-1.5 text-xs"><div className="truncate font-bold">{m.name}</div><div className="text-navy-400">{relative(m.created_at)}</div></div>
              </button>
            ))}
          </div>
      )}
      {panel === 'reports' && <ReportsPanel reps={reps} messages={messages} onAction={onAction} onResolved={() => onSignal('report')} />}
      {panel === 'settings' && <SettingsPanel conv={conv} onSaved={() => onSignal('conv')} />}
    </>
  )
  const panelTitle = { students: `الطلاب المشاركون (${parts.length})`, images: `الصور المرسلة (${images.length})`, reports: `البلاغات (${reps.length})`, settings: 'إعدادات المحادثة والطلاب' }

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="pt-safe z-20 bg-navy-900 text-white shadow-md">
        <div className="flex items-center gap-1 px-2 py-2 sm:px-4">
          <button className="icon-btn text-white hover:bg-white/10" onClick={() => nav('/t')} aria-label="رجوع"><ArrowRight className="h-6 w-6" /></button>
          <button className="min-w-0 flex-1 px-1 text-start" onClick={() => setPanel(panel === 'students' ? null : 'students')}>
            <div className="flex items-center gap-2"><h1 className="truncate text-base font-bold sm:text-lg">{conv.title}</h1><StatusBadge status={status} /></div>
            <div className="flex items-center gap-2 text-xs text-navy-200">
              <Users className="h-3.5 w-3.5" /> {activeCount} طالب مشارك
              {syncState === 'live' ? <span className="flex items-center gap-1 text-mint-200"><Wifi className="h-3 w-3" /> مباشر</span> : <span className="flex items-center gap-1 text-gold-200"><WifiOff className="h-3 w-3" /> تحديث دوري</span>}
            </div>
          </button>
          <button className="icon-btn text-white hover:bg-white/10" onClick={() => { setSearchOpen((s) => !s); setQuery('') }} aria-label="بحث في الرسائل"><Search className="h-5 w-5" /></button>
          <button className="icon-btn text-white hover:bg-white/10" onClick={() => setShareOpen(true)} aria-label="مشاركة الرابط"><Share2 className="h-5 w-5" /></button>
          {!conv.is_archived && (
            <button className="icon-btn text-white hover:bg-white/10" onClick={toggleClosed} aria-label={status === 'open' ? 'إغلاق المحادثة' : 'إعادة فتح المحادثة'} title={status === 'open' ? 'إغلاق المحادثة' : 'إعادة فتح المحادثة'}>
              {status === 'open' ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
            </button>
          )}
          <button className="icon-btn relative text-white hover:bg-white/10" onClick={() => setMenuOpen(true)} aria-label="المزيد">
            {exporting ? <Spinner className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
            {reps.length > 0 && <span className="absolute end-1 top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
          </button>
        </div>
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto px-3 pb-2 text-sm">
          <Tab active={panel === 'students'} onClick={() => setPanel(panel === 'students' ? null : 'students')} icon={<Users className="h-4 w-4" />} label={`الطلاب ${parts.length}`} />
          <Tab active={panel === 'images'} onClick={() => setPanel(panel === 'images' ? null : 'images')} icon={<Images className="h-4 w-4" />} label={`الصور ${images.length}`} />
          <Tab active={panel === 'reports'} onClick={() => setPanel(panel === 'reports' ? null : 'reports')} icon={<ShieldAlert className="h-4 w-4" />} label={`البلاغات ${reps.length}`} alert={reps.length > 0} />
          <Tab active={panel === 'settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')} icon={<Settings className="h-4 w-4" />} label="الإعدادات والرموز" />
        </div>
        {searchOpen && (
          <div className="flex items-center gap-2 px-3 pb-2.5">
            <div className="relative flex-1"><Search className="absolute start-3 top-2.5 h-4 w-4 text-navy-300" />
              <input autoFocus className="w-full rounded-xl bg-white py-2 pe-3 ps-9 text-sm text-navy-900 outline-none" placeholder="ابحث في الرسائل أو أسماء الطلاب…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            {query && <span className="shrink-0 text-xs text-navy-200">{shown.length} نتيجة</span>}
            <button className="icon-btn h-8 w-8 text-white hover:bg-white/10" onClick={() => { setSearchOpen(false); setQuery('') }} aria-label="إغلاق البحث"><X className="h-4 w-4" /></button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatView messages={shown} viewer="teacher" onAction={onAction} onOpenImage={openImage} unreadAfter={query ? null : unreadAfter.current} query={query}
            emptyState={<Empty icon={<MessageCircle className="h-8 w-8" />} title={query ? 'لا توجد نتائج' : 'لا توجد رسائل بعد'} text={query ? undefined : 'شارك رابط المحادثة مع طلابك، وستظهر رسائلهم هنا فورًا.'}
              action={!query && <button className="btn-gold" onClick={() => setShareOpen(true)}><Share2 className="h-5 w-5" /> مشاركة الرابط</button>} />} />
          <Composer teacher onSend={send} replyTo={replyTo} onCancelReply={() => setReplyTo(null)}
            disabledReason={conv.is_archived ? 'المحادثة مؤرشفة. ألغِ الأرشفة لإرسال رسائل.' : null} />
        </div>
        {panel && (
          <aside className="fixed inset-0 z-30 flex flex-col bg-white lg:static lg:z-auto lg:w-[380px] lg:border-s lg:border-navy-100">
            <div className="pt-safe flex items-center justify-between border-b border-navy-100 px-4 py-3 lg:pt-3">
              <h2 className="font-bold">{panelTitle[panel]}</h2>
              <button className="icon-btn" onClick={() => setPanel(null)} aria-label="إغلاق"><X className="h-5 w-5" /></button>
            </div>
            <div className="scrollbar-thin pb-safe flex-1 overflow-y-auto p-4">{panelBody}</div>
          </aside>
        )}
      </div>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="مشاركة رابط المحادثة">
        <div className="pb-3"><SharePanel slug={conv.slug} title={conv.title} /></div>
      </Modal>
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="خيارات المحادثة">
        <div className="flex flex-col pb-2">
          <MenuBtn icon={<FileDown />} label="تصدير PDF (طباعة / حفظ)" onClick={() => { setMenuOpen(false); nav(`/t/c/${conv.id}/export`) }} />
          <MenuBtn icon={<FileSpreadsheet />} label="تصدير Excel" onClick={doExcel} />
          <MenuBtn icon={<Settings />} label="الإعدادات وقائمة الطلاب والرموز" onClick={() => { setMenuOpen(false); setPanel('settings') }} />
          <MenuBtn icon={<ShieldAlert />} label={`البلاغات (${reps.length})`} onClick={() => { setMenuOpen(false); setPanel('reports') }} />
          <MenuBtn icon={<RefreshCw />} label="تحديث" onClick={() => { setMenuOpen(false); loadAll() }} />
          <MenuBtn icon={conv.is_archived ? <ArchiveRestore /> : <Archive />} label={conv.is_archived ? 'إلغاء الأرشفة' : 'أرشفة المحادثة'} onClick={toggleArchive} />
        </div>
      </Modal>
      <Lightbox item={lightbox} onClose={() => setLightbox(null)} allowDownload />
    </div>
  )
}

function Tab({ active, onClick, icon, label, alert }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; alert?: boolean }) {
  return (
    <button onClick={onClick} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition ${active ? 'bg-white text-navy-900' : alert ? 'bg-red-500/90 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
      {icon}{label}
    </button>
  )
}
function MenuBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-3.5 text-start font-semibold text-navy-800 transition hover:bg-navy-50 [&>svg]:h-5 [&>svg]:w-5">{icon}{label}</button>
}

function StudentsPanel({ parts, counts, onChanged }: { parts: ParticipantRow[]; counts: Map<string, number>; onChanged: () => void }) {
  if (!parts.length) return <Empty icon={<Users className="h-8 w-8" />} title="لم يدخل أي طالب بعد" text="عند دخول الطلاب تظهر أسماؤهم هنا مع وقت دخولهم." />
  const toggle = async (p: ParticipantRow) => {
    if (!p.is_blocked && !(await confirmDialog({ title: `إيقاف ${p.name}؟`, text: 'لن يستطيع إرسال رسائل أو صور في هذه المحادثة.', confirm: 'إيقاف', danger: true }))) return
    try { await api.setBlocked(p.id, !p.is_blocked); onChanged() } catch (e) { toast.err(errorMessage(e)) }
  }
  return (
    <ul className="divide-y divide-navy-50">
      {parts.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-2.5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${p.is_blocked ? 'bg-red-50 text-red-500' : 'bg-navy-50 text-navy-700'}`}>{p.name.slice(0, 1)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{p.name} {p.is_blocked && <span className="chip bg-red-50 text-red-600">موقوف</span>}</div>
            <div className="text-xs text-navy-400">دخل {fmtDateTime(p.joined_at)} · {counts.get(p.id) || 0} رسالة</div>
          </div>
          <button className={`icon-btn ${p.is_blocked ? 'text-mint-600' : 'text-red-500'}`} onClick={() => toggle(p)} title={p.is_blocked ? 'السماح بالمشاركة' : 'إيقاف المشاركة'} aria-label={p.is_blocked ? 'السماح' : 'إيقاف'}>
            {p.is_blocked ? <CheckCircle2 className="h-5 w-5" /> : <Ban className="h-5 w-5" />}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ReportsPanel({ reps, messages, onAction, onResolved }: { reps: ReportRow[]; messages: Msg[]; onAction: (a: MsgAction, m: Msg) => void; onResolved: () => void }) {
  const grouped = useMemo(() => {
    const g = new Map<string, ReportRow[]>()
    reps.forEach((r) => g.set(r.message_id, [...(g.get(r.message_id) || []), r]))
    return [...g.entries()]
  }, [reps])
  if (!grouped.length) return <Empty icon={<ShieldAlert className="h-8 w-8" />} title="لا توجد بلاغات" text="عندما يبلغ طالب عن رسالة غير مناسبة تظهر هنا." />
  return (
    <div className="space-y-3">
      {grouped.map(([mid, rs]) => {
        const m = messages.find((x) => x.id === mid)
        return (
          <div key={mid} className="rounded-2xl border border-red-100 bg-red-50/40 p-3">
            <div className="text-xs font-bold text-red-600">{rs.length} بلاغ</div>
            <div className="mt-1 font-bold">{m?.name || 'رسالة'}</div>
            <p className="line-clamp-3 text-sm text-navy-700">{m?.deleted ? 'رسالة محذوفة' : m?.body || (m?.image_path ? '📷 صورة' : '')}</p>
            {rs.some((r) => r.reason) && <p className="mt-1 text-xs text-navy-500">السبب: {rs.map((r) => r.reason).filter(Boolean).join('، ')}</p>}
            <div className="mt-2 flex gap-2">
              {m && !m.deleted && <button className="btn-danger px-3 py-1.5 text-sm" onClick={() => onAction('delete', m)}><Trash2 className="h-4 w-4" /> حذف الرسالة</button>}
              <button className="btn-outline px-3 py-1.5 text-sm" onClick={async () => { await api.resolveReports(mid); onResolved() }}>تجاهل البلاغ</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SettingsPanel({ conv, onSaved }: { conv: ConversationRow; onSaved: () => void }) {
  const [title, setTitle] = useState(conv.title)
  const [desc, setDesc] = useState(conv.description || '')
  const [grade, setGrade] = useState(conv.grade || '')
  const [mode, setMode] = useState<AccessMode>(conv.access_mode)
  const [expiry, setExpiry] = useState(conv.expires_at ? toLocalInput(conv.expires_at) : '')
  const [busy, setBusy] = useState(false)
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [names, setNames] = useState('')
  const loadRoster = useCallback(async () => setRoster(await api.roster(conv.id)), [conv.id])
  useEffect(() => { loadRoster() }, [loadRoster])

  const save = async () => {
    if (title.trim().length < 2) { toast.err('اكتب اسم الدرس'); return }
    if (mode !== 'open' && !roster?.length && !names.trim()) { toast.err('أضف أسماء الطلاب أولًا قبل تقييد الدخول'); return }
    setBusy(true)
    try {
      if (names.trim()) { await api.addRoster(conv.id, names.split(/\n|،|,/)); setNames(''); await loadRoster() }
      await api.updateConversation(conv.id, { title: title.trim(), description: desc.trim() || null, grade: grade || null, access_mode: mode, expires_at: expiry ? new Date(expiry).toISOString() : null })
      toast.ok('تم حفظ الإعدادات'); onSaved()
    } catch (e) { toast.err(errorMessage(e)) } finally { setBusy(false) }
  }
  const addNames = async () => {
    try { const n = await api.addRoster(conv.id, names.split(/\n|،|,/)); setNames(''); await loadRoster(); toast.ok(n ? `أُضيف ${n} طالب` : 'الأسماء موجودة مسبقًا') } catch (e) { toast.err(errorMessage(e)) }
  }
  const printCodes = () => {
    if (!roster?.length) return
    const w = window.open('', '_blank')
    if (!w) return
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    w.document.write(`<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>رموز الدخول</title><style>body{font-family:Cairo,Tahoma,sans-serif;padding:24px}h1{font-size:20px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.c{border:1.5px dashed #13233f;border-radius:10px;padding:12px;text-align:center}.n{font-weight:700;font-size:16px}.k{font-size:26px;letter-spacing:4px;font-weight:800;color:#13233f;margin-top:6px;font-family:monospace}</style></head><body><h1>رموز الدخول – ${esc(conv.title)}</h1><div class="g">${roster.map((r) => `<div class="c"><div class="n">${esc(r.name)}</div><div class="k">${esc(r.code)}</div></div>`).join('')}</div><script>print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div><label className="label">اسم الدرس</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} /></div>
        <div><label className="label">الوصف</label><textarea className="input min-h-[64px]" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} /></div>
        <div><label className="label">الصف</label>
          <select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">—</option>{[...new Set([...GRADES, ...(conv.grade ? [conv.grade] : [])])].map((g) => <option key={g}>{g}</option>)}</select></div>
        <div><label className="label">وقت الانتهاء (اختياري)</label>
          <div className="flex gap-2"><input type="datetime-local" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />{expiry && <button className="btn-outline" onClick={() => setExpiry('')}>إزالة</button>}</div></div>
        <div>
          <label className="label">طريقة دخول الطلاب</label>
          <div className="space-y-1.5">
            {(['open', 'roster', 'code'] as AccessMode[]).map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${mode === m ? 'border-navy-600 bg-navy-50' : 'border-navy-100'}`}>
                <input type="radio" name="mode" className="h-5 w-5 accent-navy-800" checked={mode === m} onChange={() => setMode(m)} />
                <span className="font-semibold">{ACCESS_LABEL[m]}</span>
              </label>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full" onClick={save} disabled={busy}>{busy && <Spinner className="h-5 w-5" />} حفظ الإعدادات</button>
      </section>

      <section className="space-y-3 border-t border-navy-100 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold"><KeyRound className="h-5 w-5 text-gold-500" /> قائمة الطلاب ورموز الدخول</h3>
          {!!roster?.length && <button className="btn-ghost px-2 py-1 text-sm" onClick={printCodes}><Printer className="h-4 w-4" /> طباعة</button>}
        </div>
        <p className="text-xs leading-5 text-navy-500">في وضع «رموز الدخول» يكتب الطالب اسمه ورمزه السري، فلا يستطيع أحد الدخول باسم غيره. وزّع الرموز مطبوعة على الطلاب.</p>
        <textarea className="input min-h-[80px]" placeholder={'أضف أسماء (اسم في كل سطر)'} value={names} onChange={(e) => setNames(e.target.value)} />
        <button className="btn-outline w-full" onClick={addNames} disabled={!names.trim()}>إضافة الأسماء</button>
        {roster === null ? <Spinner className="mx-auto h-5 w-5" /> : roster.length === 0 ? <p className="text-center text-sm text-navy-400">لا توجد أسماء بعد</p> : (
          <ul className="divide-y divide-navy-50 rounded-xl border border-navy-100">
            {roster.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 truncate font-semibold">{r.name}</span>
                <span className="rounded-lg bg-gold-50 px-2 py-0.5 font-mono text-base font-bold tracking-widest text-navy-800" dir="ltr">{r.code}</span>
                <button className="icon-btn h-8 w-8" title="رمز جديد" onClick={async () => { await api.regenerateCode(r.id); loadRoster() }}><RefreshCw className="h-4 w-4" /></button>
                <button className="icon-btn h-8 w-8 text-red-500" title="حذف" onClick={async () => { await api.removeRoster(r.id); loadRoster() }}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function toLocalInput(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
