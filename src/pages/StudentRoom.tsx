import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { LogIn, User, KeyRound, BookOpen, GraduationCap, Users, LogOut, Wifi, WifiOff, MessageCircle, AlertTriangle } from 'lucide-react'
import { studentApi, studentStore, PublicConv } from '../lib/studentApi'
import { ChatView, MsgAction } from '../components/ChatView'
import { Composer, SendPayload } from '../components/Composer'
import { Lightbox, LightboxItem } from '../components/Lightbox'
import { confirmDialog, Empty, FullLoader, Logo, Spinner, toast } from '../components/ui'
import { useConversationSync } from '../lib/sync'
import { uploadImage } from '../lib/media'
import { cleanName, uuid } from '../lib/format'
import type { ConvInfo, Msg, StudentSession } from '../lib/types'

export default function StudentRoom() {
  const { slug = '' } = useParams()
  const [info, setInfo] = useState<PublicConv | null | undefined>(undefined)
  const [session, setSession] = useState<StudentSession | null>(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    let on = true
    ;(async () => {
      const saved = studentStore.get(slug)
      if (saved) {
        try {
          const s = await studentApi.resume(saved.token)
          if (on) { setSession(s); setBooting(false) }
          return
        } catch (e) {
          if ((e as { code?: string }).code === 'P0002') studentStore.clear(slug)
        }
      }
      try { const i = await studentApi.publicInfo(slug); if (on) setInfo(i) } catch { if (on) setInfo(null) }
      if (on) setBooting(false)
    })()
    return () => { on = false }
  }, [slug])

  if (booting) return <FullLoader text="جارٍ فتح المحادثة…" />
  if (session) return <StudentChat session={session} slug={slug} onLeave={() => { studentStore.clear(slug); setSession(null); studentApi.publicInfo(slug).then(setInfo) }} />
  if (!info) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="card max-w-md p-2"><Empty icon={<AlertTriangle className="h-8 w-8" />} title="الرابط غير صحيح" text="تأكد من الرابط الذي أرسله المعلم، أو امسح رمز QR من جديد." action={<Link to="/" className="btn-primary">الصفحة الرئيسية</Link>} /></div>
      </div>
    )
  }
  return <Welcome slug={slug} info={info} onJoined={(s) => setSession(s)} />
}

function Welcome({ slug, info, onJoined }: { slug: string; info: PublicConv; onJoined: (s: StudentSession) => void }) {
  const [name, setName] = useState(studentStore.lastName())
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const archived = info.status === 'archived'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const n = cleanName(name)
    if (!n) { setErr('اكتب اسمك قبل الدخول'); return }
    if (n.length < 2) { setErr('الاسم قصير جدًا'); return }
    if (!/[A-Za-zء-ي]/.test(n)) { setErr('اكتب اسمًا صحيحًا'); return }
    if (info.access_mode === 'code' && !/^\d{4,8}$/.test(code.trim())) { setErr('اكتب رمز الدخول الذي أعطاك إياه المعلم'); return }
    setBusy(true)
    try {
      const s = await studentApi.join(slug, n, code.trim())
      studentStore.set(slug, { token: s.token, name: s.participant.name })
      studentStore.setLastName(n)
      onJoined(s)
    } catch (e2) { setErr((e2 as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-b from-navy-900 via-navy-800 to-navy-700 p-4">
      <div className="pt-safe mb-6"><Logo light size={44} /></div>
      <form onSubmit={submit} className="card w-full max-w-md space-y-5 p-6 sm:p-8" noValidate>
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-50 text-gold-500"><BookOpen className="h-7 w-7" /></div>
          <div className="text-sm font-semibold text-navy-500">مرحبًا بك في درس</div>
          <h1 className="text-2xl font-extrabold leading-snug text-navy-900">{info.title}</h1>
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-navy-600">
            <span className="chip bg-navy-50 text-navy-700"><GraduationCap className="h-4 w-4" /> {info.teacher_name}</span>
            {info.grade && <span className="chip bg-navy-50 text-navy-700">{info.grade}</span>}
          </div>
          {info.description && <p className="text-sm leading-6 text-navy-500">{info.description}</p>}
        </div>
        {archived ? (
          <div className="rounded-xl bg-navy-50 p-4 text-center font-semibold text-navy-600">هذه المحادثة مؤرشفة ولم تعد متاحة.</div>
        ) : (<>
          <div>
            <label className="label text-base" htmlFor="sn">اكتب اسمك قبل الدخول <span className="text-red-500">*</span></label>
            <div className="relative">
              <User className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
              <input id="sn" className="input ps-10 text-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الثلاثي" autoComplete="name" maxLength={40} required autoFocus />
            </div>
            {info.access_mode === 'roster' && <p className="mt-1.5 text-xs text-navy-500">اكتب اسمك كما سجّله المعلم.</p>}
          </div>
          {info.access_mode === 'code' && (
            <div>
              <label className="label text-base" htmlFor="sc">رمز الدخول <span className="text-red-500">*</span></label>
              <div className="relative">
                <KeyRound className="absolute start-3 top-3.5 h-5 w-5 text-navy-300" />
                <input id="sc" className="input ps-10 text-center font-mono text-xl tracking-[0.4em]" inputMode="numeric" pattern="\d*" maxLength={8} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" />
              </div>
              <p className="mt-1.5 text-xs text-navy-500">رمز سري خاص بك أعطاك إياه المعلم.</p>
            </div>
          )}
          {err && <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700">{err}</div>}
          <button className="btn-primary w-full py-3.5 text-lg" disabled={busy}>
            {busy ? <Spinner className="h-5 w-5" /> : <LogIn className="h-5 w-5" />} الدخول إلى المحادثة
          </button>
          {info.status !== 'open' && <p className="text-center text-sm text-navy-500">المحادثة مغلقة حاليًا؛ يمكنك القراءة فقط.</p>}
        </>)}
      </form>
      <p className="pb-safe mt-4 max-w-md text-center text-xs leading-5 text-navy-200">بياناتك تظهر للمعلم ولزملائك في هذه المحادثة فقط.</p>
    </div>
  )
}

function StudentChat({ session, slug, onLeave }: { session: StudentSession; slug: string; onLeave: () => void }) {
  const token = session.token
  const [conv, setConv] = useState<ConvInfo>(session.conversation)
  const [me, setMe] = useState(session.participant)
  const [map, setMap] = useState<Map<string, Msg>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null)
  const since = useRef<string | null>(null)
  const inflight = useRef(false)
  const again = useRef(false)
  const leaveRef = useRef(onLeave)
  leaveRef.current = onLeave

  const merge = useCallback((list: Msg[]) => {
    if (!list.length) return
    setMap((prev) => { const n = new Map(prev); list.forEach((m) => n.set(m.id, m)); return n })
  }, [])

  const pull = useCallback(async () => {
    if (inflight.current) { again.current = true; return }
    inflight.current = true
    try {
      const f = await studentApi.feed(token, since.current)
      merge(f.messages)
      setConv((c) => ({ ...c, ...f.conversation }))
      setMe((m) => ({ ...m, is_blocked: f.me.is_blocked }))
      since.current = new Date(new Date(f.server_time).getTime() - 5000).toISOString()
      setLoaded(true)
    } catch (e) {
      if ((e as { code?: string }).code === 'P0002') { toast.err('انتهت جلستك، ادخل من جديد'); leaveRef.current() }
    } finally {
      inflight.current = false
      if (again.current) { again.current = false; pull() }
    }
  }, [token, merge])
  useEffect(() => { pull() }, [pull])
  const syncState = useConversationSync(session.conversation.secret_key, () => { pull() })

  const messages = useMemo(() => [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)), [map])

  const disabled = me.is_blocked ? 'أوقف المعلم مشاركتك في هذه المحادثة'
    : conv.status === 'closed' ? 'أغلق المعلم المحادثة، لا يمكن إرسال رسائل جديدة'
    : conv.status === 'expired' ? 'انتهى وقت المحادثة'
    : conv.status === 'archived' ? 'المحادثة مؤرشفة' : null

  const send = async ({ text, image, replyTo: rt }: SendPayload) => {
    let path: string | null = null
    if (image) {
      path = `${session.conversation.secret_key}/${session.participant.upload_key}/${uuid()}.${image.ext}`
      await uploadImage(path, image.blob, image.type)
    }
    const m = await studentApi.send(token, text || null, path, rt?.id || null)
    merge([m])
  }

  const onAction = async (a: MsgAction, m: Msg) => {
    try {
      if (a === 'reply') setReplyTo(m)
      else if (a === 'delete') {
        if (!(await confirmDialog({ title: 'حذف رسالتك؟', confirm: 'حذف', danger: true }))) return
        await studentApi.deleteOwn(token, m.id); toast.ok('حُذفت الرسالة'); pull()
      } else if (a === 'report') {
        if (!(await confirmDialog({ title: 'الإبلاغ عن هذه الرسالة؟', text: 'سيصل البلاغ إلى المعلم فقط دون ذكر اسمك للآخرين.', confirm: 'إبلاغ', danger: true }))) return
        await studentApi.report(token, m.id); toast.ok('شكرًا لك، وصل البلاغ إلى المعلم')
      }
    } catch (e) { toast.err((e as Error).message) }
  }

  const leave = async () => {
    if (await confirmDialog({ title: 'الخروج من المحادثة؟', text: 'ستحتاج إلى إدخال اسمك مرة أخرى للعودة. رسائلك تبقى محفوظة.', confirm: 'خروج' })) onLeave()
  }
  void slug

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="pt-safe z-20 bg-navy-900 text-white shadow-md">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-navy-950"><BookOpen className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold">{conv.title}</h1>
            <div className="flex items-center gap-2 truncate text-xs text-navy-200">
              <span>{conv.teacher_name}</span>·<span className="flex items-center gap-1"><Users className="h-3 w-3" />{conv.participant_count}</span>·
              {syncState === 'live' ? <span className="flex items-center gap-1 text-mint-200"><Wifi className="h-3 w-3" /> مباشر</span> : <span className="flex items-center gap-1 text-gold-200"><WifiOff className="h-3 w-3" /> يتحدث تلقائيًا</span>}
            </div>
          </div>
          <div className="hidden text-end text-xs sm:block"><div className="text-navy-300">دخلت باسم</div><div className="font-bold">{me.name}</div></div>
          <button className="icon-btn text-white hover:bg-white/10" onClick={leave} aria-label="خروج" title="خروج"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>
      {!loaded ? <FullLoader /> : (
        <ChatView messages={messages} viewer="student" onAction={onAction}
          onOpenImage={(m) => m.image_path && setLightbox({ path: m.image_path, name: m.name, at: m.created_at })}
          emptyState={<Empty icon={<MessageCircle className="h-8 w-8" />} title={`أهلًا ${me.name} 👋`} text="لا توجد رسائل بعد. ابدأ بكتابة رسالتك أو أرسل صورة." />} />
      )}
      <Composer onSend={send} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} disabledReason={disabled} />
      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
