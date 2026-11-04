import { useEffect, useRef, useState } from 'react'
import { BarChart3, Check, Mic, Plus, Square, Trash2, Trophy, Users, X, Star, Crown, Medal } from 'lucide-react'
import { EMOJIS } from '../lib/types'
import type { BoardRow, Msg } from '../lib/types'
import { signedUrl, cachedUrl } from '../lib/media'
import { Modal, Spinner, toast } from './ui'

/* ---------------- التفاعلات ---------------- */
export function ReactionBar({ m, viewer, onReact, dark }: { m: Msg; viewer: 'teacher' | 'student'; onReact?: (m: Msg, e: string) => void; dark?: boolean }) {
  const r = m.reactions || {}
  const keys = EMOJIS.filter((e) => r[e])
  if (!keys.length) return null
  const mine = new Set(viewer === 'teacher' ? m.teacher_reactions || [] : m.my_reactions || [])
  const fromTeacher = new Set(m.teacher_reactions || [])
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {keys.map((e) => (
        <button key={e} type="button" onClick={() => onReact?.(m, e)} disabled={!onReact}
          title={fromTeacher.has(e) ? 'تفاعل المعلم' : undefined}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold transition active:scale-95 ${mine.has(e)
            ? 'bg-gold-100 text-navy-900 ring-1 ring-gold-400'
            : dark ? 'bg-white/15 text-white' : 'bg-navy-50 text-navy-700 ring-1 ring-navy-100'}`}>
          <span className="text-sm leading-none">{e}</span>{r[e]}
          {fromTeacher.has(e) && viewer === 'student' && <span className="text-[9px] text-gold-600">المعلم</span>}
        </button>
      ))}
    </div>
  )
}

export function QuickReactions({ m, viewer, onPick }: { m: Msg; viewer: 'teacher' | 'student'; onPick: (e: string) => void }) {
  const mine = new Set(viewer === 'teacher' ? m.teacher_reactions || [] : m.my_reactions || [])
  return (
    <div className="mb-3 flex justify-between gap-1 rounded-2xl bg-navy-50 p-1.5">
      {EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onPick(e)} aria-label={`تفاعل ${e}`}
          className={`flex h-11 flex-1 items-center justify-center rounded-xl text-2xl transition active:scale-90 ${mine.has(e) ? 'bg-gold-200 ring-2 ring-gold-400' : 'hover:bg-white'}`}>{e}</button>
      ))}
    </div>
  )
}

/* ---------------- التصويت / السؤال السريع ---------------- */
export function PollCard({ m, viewer, onVote, canVote }: { m: Msg; viewer: 'teacher' | 'student'; onVote?: (m: Msg, i: number) => void; canVote: boolean }) {
  const p = m.poll!
  const [showVoters, setShowVoters] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const voted = p.my_vote !== null && p.my_vote !== undefined
  const showResults = viewer === 'teacher' || voted
  const max = Math.max(1, ...(p.counts || [0]))
  const vote = async (i: number) => {
    if (!onVote || !canVote || busy !== null) return
    setBusy(i)
    try { await onVote(m, i) } finally { setBusy(null) }
  }
  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-bold text-gold-600"><BarChart3 className="h-4 w-4" /> سؤال سريع · {p.total} {p.total === 1 ? 'صوت' : 'أصوات'}</div>
      {p.options.map((o, i) => {
        const c = p.counts?.[i] ?? 0
        const pct = p.total ? Math.round((c / p.total) * 100) : 0
        const mineOpt = p.my_vote === i
        return (
          <button key={i} type="button" onClick={() => vote(i)} disabled={viewer === 'teacher' || !canVote}
            className={`relative block w-full overflow-hidden rounded-xl border px-3 py-2.5 text-start text-[15px] font-semibold transition ${mineOpt ? 'border-mint-500 bg-mint-50' : 'border-navy-100 bg-white'} ${viewer === 'student' && canVote ? 'hover:border-navy-300 active:scale-[0.99]' : ''}`}>
            {showResults && <span className={`absolute inset-y-0 start-0 ${c === max && c > 0 ? 'bg-gold-100' : 'bg-navy-50'}`} style={{ width: `${pct}%` }} />}
            <span className="relative flex items-center gap-2 text-navy-900">
              {busy === i ? <Spinner className="h-4 w-4" /> : mineOpt ? <Check className="h-4 w-4 text-mint-600" /> : <span className="h-4 w-4 rounded-full border-2 border-navy-200" />}
              <span className="flex-1" dir="auto">{o}</span>
              {showResults && <span className="text-sm text-navy-500">{c} · {pct}%</span>}
            </span>
          </button>
        )
      })}
      {viewer === 'student' && !voted && canVote && <div className="text-xs opacity-70">اختر إجابة لترى النتائج.</div>}
      {viewer === 'student' && voted && canVote && <div className="text-xs opacity-70">يمكنك تغيير اختيارك بالضغط على إجابة أخرى.</div>}
      {viewer === 'teacher' && p.total > 0 && (
        <>
          <button type="button" className="flex items-center gap-1 text-xs font-bold text-navy-500 hover:underline" onClick={() => setShowVoters((s) => !s)}>
            <Users className="h-3.5 w-3.5" /> {showVoters ? 'إخفاء أسماء المصوّتين' : 'عرض من صوّت لكل إجابة'}
          </button>
          {showVoters && (
            <div className="space-y-1 rounded-xl bg-navy-50 p-2 text-xs">
              {p.options.map((o, i) => (
                <div key={i}><b>{o}:</b> {(p.voters?.[i] || []).map((v) => v.name).join('، ') || '—'}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function PollModal({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (q: string, options: string[]) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setQ(''); setOpts(['', '']) } }, [open])
  const clean = opts.map((o) => o.trim()).filter(Boolean)
  const send = async () => {
    if (q.trim().length < 2) { toast.err('اكتب السؤال'); return }
    if (clean.length < 2) { toast.err('أضف اختيارين على الأقل'); return }
    setBusy(true)
    try { await onSend(q.trim(), clean); onClose() } catch (e) { toast.err((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-gold-500" /> سؤال سريع / تصويت</span>}
      footer={<div className="pb-2"><button className="btn-primary w-full" onClick={send} disabled={busy}>{busy && <Spinner className="h-5 w-5" />} إرسال السؤال للطلاب</button></div>}>
      <div className="space-y-3">
        <div><label className="label">السؤال</label><textarea className="input min-h-[70px]" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="مثال: ما معنى التوكل على الله؟" autoFocus /></div>
        <div className="space-y-2">
          <label className="label">الاختيارات (2 إلى 6)</label>
          {opts.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" value={o} maxLength={120} placeholder={`الاختيار ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
              {opts.length > 2 && <button className="icon-btn text-red-500" onClick={() => setOpts(opts.filter((_, j) => j !== i))} aria-label="حذف الاختيار"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {opts.length < 6 && <button className="btn-outline w-full" onClick={() => setOpts([...opts, ''])}><Plus className="h-4 w-4" /> إضافة اختيار</button>}
          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <span className="text-navy-400">اقتراحات سريعة:</span>
            <button className="chip bg-navy-50 text-navy-700" onClick={() => setOpts(['صح', 'خطأ'])}>صح / خطأ</button>
            <button className="chip bg-navy-50 text-navy-700" onClick={() => setOpts(['فهمت 👍', 'أحتاج شرحًا أكثر 🤔'])}>هل فهمت؟</button>
            <button className="chip bg-navy-50 text-navy-700" onClick={() => setOpts(['أ', 'ب', 'ج', 'د'])}>أ ب ج د</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* ---------------- الرسائل الصوتية ---------------- */
export function SignedAudio({ path, secs, dark }: { path: string; secs?: number | null; dark?: boolean }) {
  const [url, setUrl] = useState<string | null>(() => cachedUrl(path))
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    if (!url) signedUrl(path).then((u) => { if (!on) return; if (u) setUrl(u); else setFailed(true) })
    return () => { on = false }
  }, [path, url])
  return (
    <div className={`mb-1 flex min-w-[220px] items-center gap-2 rounded-xl px-2 py-1.5 ${dark ? 'bg-white/10' : 'bg-navy-50'}`}>
      <Mic className={`h-4 w-4 shrink-0 ${dark ? 'text-gold-200' : 'text-navy-500'}`} />
      {failed ? <span className="text-xs">تعذّر تشغيل التسجيل</span> : url
        ? <audio controls preload="metadata" src={url} className="h-9 w-full min-w-0" />
        : <div className="h-9 flex-1 animate-pulse rounded bg-navy-100/50" />}
      {!!secs && <span className="shrink-0 text-[11px] opacity-70">{fmtSecs(secs)}</span>}
    </div>
  )
}

export const fmtSecs = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
export const MAX_VOICE_SECS = 120

function pickMime() {
  const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac']
  if (typeof MediaRecorder === 'undefined') return null
  return c.find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
}

export interface Recording { blob: Blob; type: string; ext: string; secs: number; url: string }

/** مسجّل صوتي: يسجّل حتى دقيقتين ثم يعرض معاينة قبل الإرسال */
export function VoiceRecorder({ onDone, onCancel }: { onDone: (r: Recording) => void; onCancel: () => void }) {
  const [secs, setSecs] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const cancelled = useRef(false)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    ;(async () => {
      try {
        const mime = pickMime()
        if (mime === null || !navigator.mediaDevices?.getUserMedia) { setErr('التسجيل الصوتي غير مدعوم في هذا المتصفح'); return }
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        const r = new MediaRecorder(stream.current, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined)
        rec.current = r
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
        r.onstop = () => {
          stream.current?.getTracks().forEach((t) => t.stop())
          if (cancelled.current) return
          const type = (r.mimeType || mime || 'audio/webm').split(';')[0]
          const blob = new Blob(chunks.current, { type })
          const s = Math.max(1, Math.round((Date.now() - started.current) / 1000))
          if (blob.size > 5 * 1024 * 1024) { toast.err('التسجيل أكبر من 5 ميجابايت'); onCancel(); return }
          const ext = type.includes('mp4') || type.includes('aac') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
          onDone({ blob, type: type.includes('aac') ? 'audio/aac' : type, ext, secs: Math.min(s, MAX_VOICE_SECS), url: URL.createObjectURL(blob) })
        }
        started.current = Date.now()
        r.start(1000)
        timer = setInterval(() => {
          const s = Math.round((Date.now() - started.current) / 1000)
          setSecs(s)
          if (s >= MAX_VOICE_SECS && r.state === 'recording') r.stop()
        }, 250)
      } catch (e) {
        const n = (e as Error).name
        setErr(n === 'NotAllowedError' ? 'اسمح للموقع باستخدام الميكروفون من إعدادات المتصفح' : 'تعذّر تشغيل الميكروفون')
      }
    })()
    return () => {
      if (timer) clearInterval(timer)
      if (rec.current?.state === 'recording') { cancelled.current = true; rec.current.stop() }
      stream.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stop = () => { if (rec.current?.state === 'recording') rec.current.stop() }
  const cancel = () => { cancelled.current = true; if (rec.current?.state === 'recording') rec.current.stop(); stream.current?.getTracks().forEach((t) => t.stop()); onCancel() }

  if (err) return (
    <div className="mx-1 mb-2 flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
      <span className="flex-1">{err}</span><button className="icon-btn h-8 w-8" onClick={onCancel} aria-label="إغلاق"><X className="h-4 w-4" /></button>
    </div>
  )
  return (
    <div className="mx-1 mb-2 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
      <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
      <span className="font-mono text-lg font-bold text-red-700" dir="ltr">{fmtSecs(secs)}</span>
      <span className="flex-1 text-sm text-red-700">جارٍ التسجيل… (حتى دقيقتين)</span>
      <button className="btn-outline h-10 px-3 py-1 text-sm" onClick={cancel}><X className="h-4 w-4" /> إلغاء</button>
      <button className="btn h-10 bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700" onClick={stop}><Square className="h-4 w-4 fill-current" /> إيقاف</button>
    </div>
  )
}

/* ---------------- لوحة الشرف ---------------- */
export function BoardList({ rows, highlight, compact }: { rows: BoardRow[] | null; highlight?: string; compact?: boolean }) {
  if (!rows) return <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-navy-400" /></div>
  const list = rows.filter((r) => r.points > 0)
  if (!list.length) return (
    <div className="py-8 text-center text-sm text-navy-500"><Trophy className="mx-auto mb-2 h-10 w-10 text-gold-300" />لا توجد نقاط بعد. شارك وأجب لتظهر هنا!</div>
  )
  const medal = (i: number) => i === 0 ? <Crown className="h-5 w-5 text-gold-500" /> : i === 1 ? <Medal className="h-5 w-5 text-slate-400" /> : i === 2 ? <Medal className="h-5 w-5 text-amber-700" /> : <span className="w-5 text-center text-sm font-bold text-navy-400">{i + 1}</span>
  return (
    <div className="space-y-2">
      {!compact && <p className="text-xs leading-5 text-navy-500">النقاط: كل رسالة 1 (حتى 20)، كل تصويت 1، إجابة مميزة 5، نجمة ⭐ من المعلم 2، تصفيق 👏 من المعلم 1.</p>}
      <ol className="space-y-1.5">
        {list.map((r, i) => (
          <li key={r.participant_id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.participant_id === highlight ? 'bg-mint-50 ring-1 ring-mint-300' : i < 3 ? 'bg-gold-50' : 'bg-navy-50/60'}`}>
            {medal(i)}
            <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
            {r.featured > 0 && <span className="flex items-center gap-0.5 text-xs font-bold text-gold-600"><Star className="h-3.5 w-3.5 fill-current" />{r.featured}</span>}
            <span className="rounded-lg bg-white px-2 py-0.5 text-sm font-extrabold text-navy-800">{r.points}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
