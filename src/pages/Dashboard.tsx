import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Users, MessageCircle, MoreVertical, Lock, Unlock, Archive, ArchiveRestore, Trash2, Share2, LogOut, Sparkles, Eraser, CalendarDays, ShieldAlert, UserCog, Download, Inbox } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { clearDemo, dashboard, deleteConversation, seedDemo, updateConversation } from '../lib/teacherApi'
import type { DashboardRow } from '../lib/types'
import { fmtDate, relative } from '../lib/format'
import { confirmDialog, Empty, FullLoader, Logo, Modal, StatusBadge, toast } from '../components/ui'
import { NewConversationModal, ProfileModal } from '../components/NewConversation'
import { SharePanel } from '../components/SharePanel'
import { useInstallPrompt } from '../lib/pwa'

export default function Dashboard() {
  const { teacherName, loading: authLoading, reloadProfile, session } = useAuth()
  const nav = useNavigate()
  const [rows, setRows] = useState<DashboardRow[] | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [newOpen, setNewOpen] = useState(false)
  const [share, setShare] = useState<DashboardRow | null>(null)
  const [menu, setMenu] = useState<DashboardRow | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const install = useInstallPrompt()

  const load = useCallback(async () => {
    try { setRows(await dashboard()) } catch (e) { toast.err(errorMessage(e)); setRows([]) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load() }, 15000)
    const f = () => !document.hidden && load()
    document.addEventListener('visibilitychange', f)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', f) }
  }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows || []).filter((r) => (tab === 'archived' ? r.is_archived : !r.is_archived))
      .filter((r) => !s || r.title.toLowerCase().includes(s) || (r.grade || '').toLowerCase().includes(s) || (r.description || '').toLowerCase().includes(s))
  }, [rows, q, tab])
  const hasDemo = rows?.some((r) => r.is_demo)
  const archivedCount = rows?.filter((r) => r.is_archived).length || 0
  const totalUnread = rows?.reduce((a, r) => a + (r.is_archived ? 0 : Number(r.unread_count)), 0) || 0

  const act = async (r: DashboardRow, a: 'close' | 'reopen' | 'archive' | 'unarchive' | 'delete') => {
    setMenu(null)
    try {
      if (a === 'delete') {
        const ok = await confirmDialog({ title: `حذف «${r.title}»؟`, text: 'سيتم حذف المحادثة وجميع رسائلها وصورها نهائيًا، ولا يمكن التراجع. يمكنك بدلًا من ذلك أرشفتها.', confirm: 'حذف نهائي', danger: true })
        if (!ok) return
        await deleteConversation(r.id)
        toast.ok('تم حذف المحادثة')
      } else if (a === 'close') { await updateConversation(r.id, { is_closed: true }); toast.ok('تم إغلاق المحادثة') }
      else if (a === 'reopen') {
        await updateConversation(r.id, { is_closed: false, ...(r.status === 'expired' ? { expires_at: null } : {}) }); toast.ok('أُعيد فتح المحادثة')
      }
      else if (a === 'archive') { await updateConversation(r.id, { is_archived: true }); toast.ok('تمت الأرشفة') }
      else if (a === 'unarchive') { await updateConversation(r.id, { is_archived: false }); toast.ok('أُعيدت من الأرشيف') }
      load()
    } catch (e) { toast.err(errorMessage(e)) }
  }

  const demo = async (add: boolean) => {
    try {
      if (add) { await seedDemo(); toast.ok('أُضيفت بيانات تجريبية') }
      else {
        if (!(await confirmDialog({ title: 'حذف البيانات التجريبية؟', text: 'ستُحذف المحادثات المعلّمة بـ«تجريبي» فقط.', confirm: 'حذف', danger: true }))) return
        const n = await clearDemo(); toast.ok(`حُذفت ${n} محادثة تجريبية`)
      }
      load()
    } catch (e) { toast.err(errorMessage(e)) }
  }

  if (authLoading) return <FullLoader />
  const needsProfile = !teacherName

  return (
    <div className="min-h-full">
      <header className="pt-safe sticky top-0 z-20 bg-navy-900 text-white shadow-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Logo light size={36} />
          <div className="flex items-center gap-1">
            {install.canInstall && <button className="icon-btn text-white hover:bg-white/10" onClick={install.prompt} title="تثبيت التطبيق"><Download className="h-5 w-5" /></button>}
            <button className="hidden items-center gap-2 rounded-full px-3 py-1.5 text-sm hover:bg-white/10 sm:flex" onClick={() => setProfileOpen(true)}><UserCog className="h-4 w-4" />{teacherName || session?.user.email}</button>
            <button className="icon-btn text-white hover:bg-white/10 sm:hidden" onClick={() => setProfileOpen(true)} aria-label="الملف الشخصي"><UserCog className="h-5 w-5" /></button>
            <button className="icon-btn text-white hover:bg-white/10" onClick={async () => { await supabase.auth.signOut(); nav('/') }} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold">مرحبًا {teacherName || ''} 👋</h1>
            <p className="text-sm text-navy-500">{totalUnread > 0 ? `لديك ${totalUnread} رسالة جديدة غير مقروءة` : 'جميع المحادثات محفوظة في حسابك'}</p>
          </div>
          <button className="btn-gold px-6 py-3.5 text-lg" onClick={() => setNewOpen(true)}><Plus className="h-6 w-6" /> إنشاء محادثة جديدة</button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
            <input className="input ps-10" placeholder="ابحث عن محادثة أو درس أو صف…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex rounded-xl bg-white p-1 shadow-soft">
            <button onClick={() => setTab('active')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${tab === 'active' ? 'bg-navy-800 text-white' : 'text-navy-600'}`}>المحادثات</button>
            <button onClick={() => setTab('archived')} className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold ${tab === 'archived' ? 'bg-navy-800 text-white' : 'text-navy-600'}`}>الأرشيف {archivedCount > 0 && `(${archivedCount})`}</button>
          </div>
        </div>

        {rows === null ? <FullLoader /> : filtered.length === 0 ? (
          <div className="card">
            {q ? <Empty icon={<Search className="h-8 w-8" />} title="لا توجد نتائج" text="جرّب كلمة بحث أخرى." />
              : tab === 'archived' ? <Empty icon={<Archive className="h-8 w-8" />} title="الأرشيف فارغ" text="المحادثات التي تؤرشفها تظهر هنا وتبقى محفوظة." />
              : <Empty icon={<Inbox className="h-8 w-8" />} title="لا توجد محادثات بعد" text="أنشئ محادثة لدرسك الأول وشارك رابطها مع الطلاب. يمكنك أيضًا إضافة بيانات تجريبية لترى شكل المنصة."
                  action={<div className="flex flex-wrap justify-center gap-2"><button className="btn-primary" onClick={() => setNewOpen(true)}><Plus className="h-5 w-5" /> إنشاء محادثة</button>
                    <button className="btn-outline" onClick={() => demo(true)}><Sparkles className="h-5 w-5" /> بيانات تجريبية</button></div>} />}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((r) => (
              <div key={r.id} className="card group relative flex flex-col gap-3 p-4 transition hover:shadow-lg">
                <Link to={`/t/c/${r.id}`} className="absolute inset-0 rounded-2xl" aria-label={`فتح ${r.title}`} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-bold">{r.title}</h3>
                      {r.is_demo && <span className="chip bg-violet-50 text-violet-700">تجريبي</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-500">
                      <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(r.created_at)}</span>
                      {r.grade && <span>{r.grade}</span>}
                    </div>
                  </div>
                  <div className="relative z-10 flex items-center gap-1">
                    {Number(r.unread_count) > 0 && <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-mint-500 px-2 text-xs font-bold text-white" title="رسائل جديدة غير مقروءة">{r.unread_count}</span>}
                    <button className="icon-btn" onClick={() => setMenu(r)} aria-label="خيارات"><MoreVertical className="h-5 w-5" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge status={r.status} />
                  <span className="chip bg-navy-50 text-navy-600"><Users className="h-3.5 w-3.5" />{r.participant_count} طالب</span>
                  <span className="chip bg-navy-50 text-navy-600"><MessageCircle className="h-3.5 w-3.5" />{r.message_count} رسالة</span>
                  {Number(r.report_count) > 0 && <span className="chip bg-red-50 text-red-600"><ShieldAlert className="h-3.5 w-3.5" />{r.report_count} بلاغ</span>}
                  {r.last_message_at && <span className="ms-auto text-xs text-navy-400">آخر نشاط {relative(r.last_message_at)}</span>}
                </div>
                <div className="relative z-10 flex gap-2">
                  <button className="btn-outline flex-1 py-2 text-sm" onClick={() => setShare(r)}><Share2 className="h-4 w-4" /> الرابط و QR</button>
                  <Link to={`/t/c/${r.id}`} className="btn-primary flex-1 py-2 text-sm">فتح المحادثة</Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 pt-4 text-sm">
          {rows && rows.length > 0 && !hasDemo && <button className="btn-ghost text-sm" onClick={() => demo(true)}><Sparkles className="h-4 w-4" /> إضافة بيانات تجريبية</button>}
          {hasDemo && <button className="btn-ghost text-sm text-red-600" onClick={() => demo(false)}><Eraser className="h-4 w-4" /> حذف البيانات التجريبية</button>}
        </div>
      </main>

      <NewConversationModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={load} />
      <Modal open={!!share} onClose={() => setShare(null)} title={share ? `مشاركة «${share.title}»` : ''}>
        {share && <div className="pb-3"><SharePanel slug={share.slug} title={share.title} /></div>}
      </Modal>
      <Modal open={!!menu} onClose={() => setMenu(null)} title={menu?.title}>
        {menu && (
          <div className="flex flex-col pb-2">
            <MenuItem icon={<Share2 />} label="مشاركة الرابط و QR" onClick={() => { setShare(menu); setMenu(null) }} />
            {menu.status === 'open'
              ? <MenuItem icon={<Lock />} label="إغلاق المحادثة (منع الرسائل الجديدة)" onClick={() => act(menu, 'close')} />
              : !menu.is_archived && <MenuItem icon={<Unlock />} label="إعادة فتح المحادثة" onClick={() => act(menu, 'reopen')} />}
            {menu.is_archived
              ? <MenuItem icon={<ArchiveRestore />} label="إلغاء الأرشفة" onClick={() => act(menu, 'unarchive')} />
              : <MenuItem icon={<Archive />} label="أرشفة المحادثة" onClick={() => act(menu, 'archive')} />}
            <MenuItem icon={<Trash2 />} label="حذف المحادثة نهائيًا" danger onClick={() => act(menu, 'delete')} />
          </div>
        )}
      </Modal>
      <ProfileModal key={String(needsProfile || profileOpen)} open={needsProfile || profileOpen} initial={teacherName || ''} onSaved={async () => { setProfileOpen(false); await reloadProfile() }} />
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-3 rounded-xl px-3 py-3.5 text-start font-semibold transition hover:bg-navy-50 [&>svg]:h-5 [&>svg]:w-5 ${danger ? 'text-red-600' : 'text-navy-800'}`}>
      {icon}{label}
    </button>
  )
}
