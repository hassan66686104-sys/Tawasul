import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, Pin, Star, Reply, Trash2, Flag, Download, MoreVertical, Megaphone, ImageOff, CornerDownLeft, PinOff, StarOff, ShieldAlert } from 'lucide-react'
import type { Msg } from '../lib/types'
import { dayLabel, fmtTime } from '../lib/format'
import { signedUrl, cachedUrl } from '../lib/media'
import { Modal } from './ui'
import { PollCard, QuickReactions, ReactionBar, SignedAudio } from './Extras'

export type MsgAction = 'reply' | 'pin' | 'unpin' | 'feature' | 'unfeature' | 'delete' | 'report' | 'download'

const NAME_COLORS = ['text-sky-700', 'text-emerald-700', 'text-violet-700', 'text-rose-700', 'text-amber-700', 'text-teal-700', 'text-indigo-700', 'text-fuchsia-700']
function nameColor(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return NAME_COLORS[h % NAME_COLORS.length] }

export function SignedImage({ path, alt, className, onClick }: { path: string; alt: string; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(() => cachedUrl(path))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    if (!url) signedUrl(path).then((u) => { if (!on) return; if (u) setUrl(u); else setFailed(true) })
    return () => { on = false }
  }, [path, url])
  if (failed) return <div className={`flex items-center justify-center gap-2 bg-navy-50 text-xs text-navy-400 ${className}`}><ImageOff className="h-5 w-5" /> تعذّر عرض الصورة</div>
  if (!url) return <div className={`animate-pulse bg-navy-100 ${className}`} />
  return <img src={url} alt={alt} loading="lazy" onClick={onClick} className={`cursor-zoom-in ${className}`} />
}

function highlight(text: string, q?: string) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return <>{text.slice(0, i)}<mark className="rounded bg-gold-200 px-0.5">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

function linkify(text: string, q?: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">{p}</a>
    : <Fragment key={i}>{highlight(p, q)}</Fragment>)
}

export function ChatView({ messages, viewer, onAction, onOpenImage, unreadAfter, query, emptyState, canAct = true, onReact, onVote, canVote = true, banner }: {
  messages: Msg[]
  viewer: 'teacher' | 'student'
  onAction: (a: MsgAction, m: Msg) => void
  onReact?: (m: Msg, emoji: string) => void
  onVote?: (m: Msg, option: number) => Promise<void>
  canVote?: boolean
  banner?: React.ReactNode
  onOpenImage: (m: Msg) => void
  unreadAfter?: string | null
  query?: string
  emptyState?: React.ReactNode
  canAct?: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const [menuFor, setMenuFor] = useState<Msg | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const lastLen = useRef(0)
  const lastId = useRef<string | null>(null)
  const firstPaint = useRef(true)

  const pinned = useMemo(() => messages.filter((m) => m.is_pinned && !m.deleted), [messages])
  const [pinIdx, setPinIdx] = useState(0)
  const firstUnreadId = useMemo(() => {
    if (!unreadAfter) return null
    const t = new Date(unreadAfter).getTime()
    return messages.find((m) => !m.mine && m.role === 'student' && new Date(m.created_at).getTime() > t)?.id || null
  }, [messages, unreadAfter])

  const scrollToBottom = (smooth = true) => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setNewCount(0)
  }

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !messages.length) return
    const last = messages[messages.length - 1]
    if (firstPaint.current) {
      firstPaint.current = false
      const target = firstUnreadId && document.getElementById(`m-${firstUnreadId}`)
      if (target) target.scrollIntoView({ block: 'center' })
      else el.scrollTop = el.scrollHeight
    } else if (last.id !== lastId.current) {
      const added = Math.max(1, messages.length - lastLen.current)
      if (last.mine || atBottom) requestAnimationFrame(() => scrollToBottom(true))
      else setNewCount((n) => n + added)
    }
    lastLen.current = messages.length
    lastId.current = last.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const b = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    setAtBottom(b)
    if (b) setNewCount(0)
  }

  const jumpTo = (id: string) => {
    const t = document.getElementById(`m-${id}`)
    if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); setFlashId(id); setTimeout(() => setFlashId(null), 1500) }
  }

  const currentPin = pinned.length ? pinned[Math.min(pinIdx, pinned.length - 1)] : null

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {currentPin && (
        <button onClick={() => { jumpTo(currentPin.id); setPinIdx((i) => (i + 1) % pinned.length) }}
          className="z-10 flex items-center gap-3 border-b border-gold-200 bg-gold-50/95 px-4 py-2 text-start backdrop-blur">
          <Pin className="h-4 w-4 shrink-0 rotate-45 text-gold-600" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-gold-600">رسالة مثبّتة {pinned.length > 1 && `(${Math.min(pinIdx, pinned.length - 1) + 1}/${pinned.length})`}</div>
            <div className="truncate text-sm text-navy-800">{currentPin.body || (currentPin.audio_path ? '🎤 رسالة صوتية' : '📷 صورة')}</div>
          </div>
        </button>
      )}
      {banner}
      <div ref={scroller} onScroll={onScroll} className="chat-bg scrollbar-thin flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-6">
        {!messages.length && emptyState}
        <div className="mx-auto flex max-w-3xl flex-col gap-1">
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
            const grouped = !newDay && prev && prev.role === m.role && prev.participant_id === m.participant_id && !prev.is_announcement && !m.is_announcement &&
              new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60000
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <div className="my-3 flex justify-center"><span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-navy-500 shadow-sm">{dayLabel(m.created_at)}</span></div>
                )}
                {m.id === firstUnreadId && (
                  <div className="my-2 flex items-center gap-2 text-xs font-bold text-gold-600"><span className="h-px flex-1 bg-gold-300" />رسائل جديدة<span className="h-px flex-1 bg-gold-300" /></div>
                )}
                <Bubble m={m} viewer={viewer} grouped={!!grouped} query={query} flash={flashId === m.id}
                  onMenu={() => canAct && !m.deleted && !m.pending && setMenuFor(m)} onOpenImage={() => onOpenImage(m)} onJump={jumpTo}
                  onReact={canAct ? onReact : undefined} onVote={onVote} canVote={canVote} />
              </Fragment>
            )
          })}
        </div>
      </div>
      {(!atBottom || newCount > 0) && messages.length > 0 && (
        <button onClick={() => scrollToBottom()} className="animate-pop absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-navy-800 px-3.5 py-2 text-sm font-bold text-white shadow-xl">
          <ArrowDown className="h-4 w-4" />
          {newCount > 0 ? `${newCount} ${newCount === 1 ? 'رسالة جديدة' : 'رسائل جديدة'}` : 'الأحدث'}
        </button>
      )}
      <ActionSheet m={menuFor} viewer={viewer} onClose={() => setMenuFor(null)} onAction={(a, m) => { setMenuFor(null); onAction(a, m) }}
        onReact={onReact ? (m, e) => { setMenuFor(null); onReact(m, e) } : undefined} />
    </div>
  )
}

function Bubble({ m, viewer, grouped, query, flash, onMenu, onOpenImage, onJump, onReact, onVote, canVote }: {
  m: Msg; viewer: 'teacher' | 'student'; grouped: boolean; query?: string; flash: boolean
  onMenu: () => void; onOpenImage: () => void; onJump: (id: string) => void
  onReact?: (m: Msg, e: string) => void; onVote?: (m: Msg, i: number) => Promise<void>; canVote: boolean
}) {
  const isTeacher = m.role === 'teacher'
  const mine = !!m.mine
  if (m.deleted) {
    return (
      <div id={`m-${m.id}`} className={`flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'mt-2'}`}>
        <div className="rounded-2xl bg-white/70 px-3 py-2 text-sm italic text-navy-400 ring-1 ring-navy-100">
          {m.deleted_by === 'teacher' ? 'حذف المعلم هذه الرسالة' : 'تم حذف هذه الرسالة'} · {fmtTime(m.created_at)}
        </div>
      </div>
    )
  }
  if (m.is_announcement) {
    return (
      <div id={`m-${m.id}`} className={`my-2 flex justify-center ${flash ? 'animate-flash rounded-2xl' : ''}`}>
        <div className="w-full max-w-xl rounded-2xl border border-gold-300 bg-gradient-to-b from-gold-50 to-white p-4 shadow-soft" onClick={onMenu}>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-gold-600">
            <Megaphone className="h-4 w-4" /> إعلان من {m.name} {m.is_pinned && <Pin className="h-3.5 w-3.5 rotate-45" />}
            <span className="ms-auto font-normal text-navy-400">{fmtTime(m.created_at)}</span>
          </div>
          {m.image_path && <SignedImage path={m.image_path} alt="صورة الإعلان" onClick={onOpenImage} className="mb-2 max-h-80 w-full rounded-xl object-cover" />}
          {m.audio_path && <SignedAudio path={m.audio_path} secs={m.audio_secs} />}
          {m.body && <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-navy-900" dir="auto">{linkify(m.body, query)}</p>}
          {m.poll && <div onClick={(e) => e.stopPropagation()}><PollCard m={m} viewer={viewer} onVote={onVote} canVote={canVote} /></div>}
          <div onClick={(e) => e.stopPropagation()}><ReactionBar m={m} viewer={viewer} onReact={onReact} /></div>
          {viewer === 'teacher' && !!m.report_count && <ReportTag n={m.report_count} />}
        </div>
      </div>
    )
  }
  const tone = isTeacher
    ? 'bg-navy-800 text-white'
    : mine ? 'bg-[#dcf3e8] text-navy-900' : 'bg-white text-navy-900'
  const showName = !grouped && !(mine && viewer === 'student')
  return (
    <div id={`m-${m.id}`} className={`group flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'mt-2'} ${flash ? 'animate-flash rounded-2xl' : ''}`}>
      <div className={`relative max-w-[85%] sm:max-w-[70%] ${m.pending ? 'opacity-60' : ''}`}>
        <div className={`rounded-2xl px-3 pb-1.5 pt-2 shadow-sm ${tone} ${m.is_featured ? 'ring-2 ring-gold-400' : 'ring-1 ring-black/5'} ${mine ? 'rounded-se-md' : 'rounded-ss-md'}`}>
          {showName && (
            <div className={`mb-0.5 flex items-center gap-1.5 text-[13px] font-bold ${isTeacher ? 'text-gold-200' : nameColor(m.name)}`}>
              {m.name}
              {isTeacher && <span className="chip bg-gold-400 px-1.5 py-0 text-[10px] text-navy-950">المعلم</span>}
            </div>
          )}
          {m.is_featured && <div className={`mb-1 flex items-center gap-1 text-xs font-bold ${isTeacher ? 'text-gold-200' : 'text-gold-600'}`}><Star className="h-3.5 w-3.5 fill-current" /> إجابة مميزة</div>}
          {m.reply && (
            <button onClick={() => onJump(m.reply!.id)} className={`mb-1.5 block w-full rounded-lg border-s-4 px-2 py-1 text-start text-xs ${isTeacher ? 'border-gold-300 bg-white/10' : 'border-navy-300 bg-navy-50/80'}`}>
              <div className="font-bold">{m.reply.name}</div>
              <div className="line-clamp-2 opacity-80">{m.reply.body || (m.reply.has_image ? '📷 صورة' : 'رسالة محذوفة')}</div>
            </button>
          )}
          {m.image_path && (
            <SignedImage path={m.image_path} alt={`صورة من ${m.name}`} onClick={onOpenImage}
              className="mb-1 h-auto max-h-72 w-64 max-w-full rounded-xl object-cover sm:w-72" />
          )}
          {m.audio_path && <SignedAudio path={m.audio_path} secs={m.audio_secs} dark={isTeacher} />}
          {m.body && <p className="whitespace-pre-wrap break-words text-[15px] leading-7" dir="auto">{linkify(m.body, query)}</p>}
          {m.poll && <PollCard m={m} viewer={viewer} onVote={onVote} canVote={canVote} />}
          <ReactionBar m={m} viewer={viewer} onReact={onReact} dark={isTeacher} />
          <div className={`mt-0.5 flex items-center justify-end gap-1.5 text-[11px] ${isTeacher ? 'text-white/60' : 'text-navy-400'}`}>
            {m.is_pinned && <Pin className="h-3 w-3 rotate-45" />}
            {m.pending ? 'جارٍ الإرسال…' : fmtTime(m.created_at)}
          </div>
          {viewer === 'teacher' && !!m.report_count && <ReportTag n={m.report_count} />}
        </div>
        {!m.pending && (
          <button onClick={onMenu} aria-label="خيارات الرسالة"
            className={`absolute top-1 ${mine ? "-start-8" : "-end-8"} flex h-7 w-7 items-center justify-center rounded-full text-navy-400 hover:bg-white transition sm:opacity-0 sm:group-hover:opacity-100`}>
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function ReportTag({ n }: { n: number }) {
  return <div className="mt-1 flex items-center gap-1 rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600"><ShieldAlert className="h-3.5 w-3.5" /> أبلغ عنها {n} {n === 1 ? 'طالب' : 'طلاب'}</div>
}

function ActionSheet({ m, viewer, onClose, onAction, onReact }: { m: Msg | null; viewer: 'teacher' | 'student'; onClose: () => void; onAction: (a: MsgAction, m: Msg) => void; onReact?: (m: Msg, e: string) => void }) {
  if (!m) return null
  const items: { a: MsgAction; label: string; icon: React.ReactNode; danger?: boolean }[] = [{ a: 'reply', label: 'رد على الرسالة', icon: <CornerDownLeft className="h-5 w-5" /> }]
  if (viewer === 'teacher') {
    items.push(m.is_pinned ? { a: 'unpin', label: 'إلغاء التثبيت', icon: <PinOff className="h-5 w-5" /> } : { a: 'pin', label: 'تثبيت أعلى المحادثة', icon: <Pin className="h-5 w-5" /> })
    if (m.role === 'student') items.push(m.is_featured ? { a: 'unfeature', label: 'إلغاء «إجابة مميزة»', icon: <StarOff className="h-5 w-5" /> } : { a: 'feature', label: 'تمييز كـ«إجابة مميزة»', icon: <Star className="h-5 w-5" /> })
    if (m.image_path) items.push({ a: 'download', label: 'تنزيل الصورة', icon: <Download className="h-5 w-5" /> })
    items.push({ a: 'delete', label: 'حذف الرسالة', icon: <Trash2 className="h-5 w-5" />, danger: true })
  } else {
    if (m.mine) items.push({ a: 'delete', label: 'حذف رسالتي', icon: <Trash2 className="h-5 w-5" />, danger: true })
    else items.push({ a: 'report', label: 'الإبلاغ عن رسالة غير مناسبة', icon: <Flag className="h-5 w-5" />, danger: true })
  }
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Reply className="h-5 w-5 text-navy-400" /> {m.name}</span>}>
      {onReact && <QuickReactions m={m} viewer={viewer} onPick={(e) => onReact(m, e)} />}
      <p className="mb-3 line-clamp-3 rounded-xl bg-navy-50 p-3 text-sm text-navy-700" dir="auto">{m.body || (m.audio_path ? '🎤 رسالة صوتية' : '📷 صورة')}</p>
      <div className="flex flex-col pb-2">
        {items.map((it) => (
          <button key={it.a} onClick={() => onAction(it.a, m)}
            className={`flex items-center gap-3 rounded-xl px-3 py-3.5 text-start font-semibold transition hover:bg-navy-50 ${it.danger ? 'text-red-600' : 'text-navy-800'}`}>
            {it.icon} {it.label}
          </button>
        ))}
      </div>
    </Modal>
  )
}
