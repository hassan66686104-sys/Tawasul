import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Camera, SendHorizontal, X, Reply, Lock, Megaphone, Mic, BarChart3 } from 'lucide-react'
import { PollModal, Recording, VoiceRecorder, fmtSecs } from './Extras'
import { ACCEPT, prepareImage, validateImageFile, PreparedImage } from '../lib/image'
import { CameraModal } from './CameraModal'
import { Spinner, toast } from './ui'
import type { Msg } from '../lib/types'

export interface SendPayload { text: string; image: PreparedImage | null; replyTo: Msg | null; announcement: boolean; audio: Recording | null }

export function Composer({ onSend, disabledReason, replyTo, onCancelReply, teacher = false, onPoll }: {
  onSend: (p: SendPayload) => Promise<void>
  onPoll?: (question: string, options: string[]) => Promise<void>
  disabledReason?: string | null
  replyTo: Msg | null
  onCancelReply: () => void
  teacher?: boolean
}) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<PreparedImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [camOpen, setCamOpen] = useState(false)
  const [announce, setAnnounce] = useState(false)
  const [recording, setRecording] = useState(false)
  const [audio, setAudio] = useState<Recording | null>(null)
  const [pollOpen, setPollOpen] = useState(false)
  const gallery = useRef<HTMLInputElement>(null)
  const capture = useRef<HTMLInputElement>(null)
  const ta = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [text])
  useEffect(() => { if (replyTo) ta.current?.focus() }, [replyTo])
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio.url) }, [audio])

  const takeBlob = useCallback(async (b: Blob, fileName = 'camera.jpg') => {
    const f = b instanceof File ? b : new File([b], fileName, { type: b.type || 'image/jpeg' })
    const err = validateImageFile(f)
    if (err) { toast.err(err); return }
    setPreparing(true)
    try { setImage(await prepareImage(f)) } catch (e) { toast.err((e as Error).message) } finally { setPreparing(false) }
  }, [])

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) takeBlob(f, f.name)
  }

  const openCamera = () => {
    const touch = window.matchMedia('(pointer: coarse)').matches
    // على الهواتف والآيباد: كاميرا الجهاز الأصلية (الأكثر موثوقية)، وعلى الكمبيوتر: كاميرا داخل الموقع
    if (touch) capture.current?.click()
    else setCamOpen(true)
  }
  const closeCam = useCallback(() => setCamOpen(false), [])
  const fallbackCam = useCallback(() => capture.current?.click(), [])

  const canSend = !busy && !preparing && !recording && (text.trim().length > 0 || !!image || !!audio)
  const send = async () => {
    if (!canSend) return
    setBusy(true)
    try {
      await onSend({ text: text.trim(), image, replyTo, announcement: teacher && announce, audio })
      setText(''); setImage(null); setAudio(null); setAnnounce(false); onCancelReply()
    } catch (e) {
      toast.err((e as Error).message || 'تعذّر الإرسال')
    } finally {
      setBusy(false)
      ta.current?.focus()
    }
  }

  if (disabledReason) {
    return (
      <div className="pb-safe flex items-center justify-center gap-2 border-t border-navy-100 bg-white px-4 py-4 text-sm font-semibold text-navy-500">
        <Lock className="h-4 w-4" /> {disabledReason}
      </div>
    )
  }

  return (
    <div className="pb-safe border-t border-navy-100 bg-white/95 px-2 pt-2 backdrop-blur sm:px-3">
      {replyTo && (
        <div className="mx-1 mb-2 flex items-center gap-2 rounded-xl border-s-4 border-gold-400 bg-gold-50 px-3 py-2 text-sm">
          <Reply className="h-4 w-4 shrink-0 text-gold-600" />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-navy-800">الرد على {replyTo.name}</div>
            <div className="truncate text-navy-600">{replyTo.body || (replyTo.image_path ? '📷 صورة' : '')}</div>
          </div>
          <button className="icon-btn h-8 w-8" onClick={onCancelReply} aria-label="إلغاء الرد"><X className="h-4 w-4" /></button>
        </div>
      )}
      {(image || preparing) && (
        <div className="mx-1 mb-2 flex items-start gap-3 rounded-2xl border border-navy-100 bg-navy-50/60 p-2">
          {preparing ? (
            <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-white"><Spinner className="h-6 w-6 text-navy-400" /></div>
          ) : image && (
            <img src={image.url} alt="معاينة الصورة" className="h-28 w-28 rounded-xl object-cover ring-1 ring-navy-100" />
          )}
          <div className="flex-1 pt-1 text-sm text-navy-600">
            <div className="font-bold text-navy-800">معاينة الصورة</div>
            <div>يمكنك كتابة تعليق ثم الضغط على إرسال.</div>
          </div>
          <button className="btn-outline h-9 px-3 py-1 text-sm" onClick={() => setImage(null)} disabled={busy}>
            <X className="h-4 w-4" /> إلغاء
          </button>
        </div>
      )}
      {recording && <VoiceRecorder onDone={(r) => { setRecording(false); setAudio(r) }} onCancel={() => setRecording(false)} />}
      {audio && !recording && (
        <div className="mx-1 mb-2 flex items-center gap-2 rounded-2xl border border-navy-100 bg-navy-50/60 p-2">
          <Mic className="h-5 w-5 shrink-0 text-navy-500" />
          <audio controls src={audio.url} className="h-10 min-w-0 flex-1" />
          <span className="text-xs text-navy-500" dir="ltr">{fmtSecs(audio.secs)}</span>
          <button className="btn-outline h-9 px-3 py-1 text-sm" onClick={() => setAudio(null)} disabled={busy}><X className="h-4 w-4" /> إلغاء</button>
        </div>
      )}
      {teacher && (
        <div className="mx-1 mb-1.5 flex gap-1.5">
          {onPoll && (
            <button type="button" onClick={() => setPollOpen(true)} disabled={busy}
              className="chip bg-sky-50 px-3 py-1.5 text-sky-700 hover:bg-sky-100" title="سؤال سريع / تصويت">
              <BarChart3 className="h-4 w-4" /> سؤال سريع
            </button>
          )}
          <button type="button" onClick={() => setAnnounce((a) => !a)} aria-pressed={announce} title="إعلان لجميع المشاركين"
            className={`chip px-3 py-1.5 ${announce ? 'bg-gold-400 text-navy-950' : 'bg-gold-50 text-gold-600 hover:bg-gold-100'}`}>
            <Megaphone className="h-4 w-4" /> {announce ? 'سيُرسل كإعلان' : 'إعلان'}
          </button>
        </div>
      )}
      <div className="flex items-end gap-1.5 pb-1">
        <button type="button" onClick={() => gallery.current?.click()} disabled={busy}
          className="flex h-11 w-11 shrink-0 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700 transition hover:bg-navy-100 active:scale-95" aria-label="إرفاق صورة من المعرض" title="إرفاق صورة">
          <ImagePlus className="h-6 w-6" />
        </button>
        <button type="button" onClick={openCamera} disabled={busy}
          className="flex h-11 w-11 shrink-0 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-mint-50 text-mint-700 transition hover:bg-mint-100 active:scale-95" aria-label="فتح الكاميرا" title="التقاط صورة">
          <Camera className="h-6 w-6" />
        </button>
        <button type="button" onClick={() => { setImage(null); setAudio(null); setRecording(true) }} disabled={busy || recording}
          className={`flex h-11 w-11 shrink-0 sm:h-12 sm:w-12 items-center justify-center rounded-2xl transition active:scale-95 ${recording ? 'bg-red-500 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`} aria-label="تسجيل رسالة صوتية" title="رسالة صوتية">
          <Mic className="h-6 w-6" />
        </button>
        <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000}
          placeholder={announce ? 'اكتب إعلانًا لجميع المشاركين…' : 'اكتب رسالتك…'} dir="auto"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send() }
          }}
          className="scrollbar-thin min-h-[48px] flex-1 resize-none rounded-2xl border border-navy-200 bg-white px-4 py-3 text-base leading-6 outline-none transition focus:border-navy-400 focus:ring-4 focus:ring-navy-100" />
        <button type="button" onClick={send} disabled={!canSend}
          className="flex h-11 w-11 shrink-0 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-navy-800 text-white shadow-soft transition hover:bg-navy-700 active:scale-95 disabled:opacity-40" aria-label="إرسال">
          {busy ? <Spinner className="h-5 w-5" /> : <SendHorizontal className="h-6 w-6 -scale-x-100" />}
        </button>
      </div>
      <input ref={gallery} type="file" accept={ACCEPT} className="hidden" onChange={onFile} />
      <input ref={capture} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      {onPoll && <PollModal open={pollOpen} onClose={() => setPollOpen(false)} onSend={onPoll} />}
      <CameraModal open={camOpen} onClose={closeCam} onCapture={(b) => takeBlob(b)} onFallback={fallbackCam} />
    </div>
  )
}
