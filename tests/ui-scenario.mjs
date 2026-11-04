// اختبار واجهات سيناريو «التوكل على الله» في متصفح حقيقي (Chromium) مع خادم Supabase محاكًى في الذاكرة.
// قاعدة البيانات الحقيقية تُختبر منفصلة عبر tests/db-scenario.sql. التشغيل:
//   npm run build && npx vite preview --port 4173 &  node tests/ui-scenario.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { randomUUID, randomBytes } from 'node:crypto'
const { chromium, devices } = createRequire(import.meta.url)('playwright')

const BASE = process.env.BASE || 'http://localhost:4173'
const SB = 'https://pqkaotqtwdaoolbjzpyk.supabase.co'
const OUT = process.env.OUT || 'test-results'
mkdirSync(OUT, { recursive: true })

// ---------------- خادم Supabase مُحاكى ----------------
const UID = randomUUID()
const db = { teachers: [], convs: [], parts: [], roster: [], msgs: [], reports: [], tokens: new Map(), objects: new Map() }
const now = () => new Date().toISOString()
let tick = 0
const ts = () => new Date(Date.now() + (tick++)).toISOString()
const norm = (s) => s.trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase()
const status = (c) => c.is_archived ? 'archived' : c.is_closed ? 'closed' : c.expires_at && new Date(c.expires_at) <= new Date() ? 'expired' : 'open'
const teacherName = (c) => db.teachers.find((t) => t.id === c.owner_id)?.display_name || 'المعلم'
const convJson = (c) => ({ id: c.id, title: c.title, description: c.description, grade: c.grade, access_mode: c.access_mode, status: status(c), expires_at: c.expires_at,
  teacher_name: teacherName(c), participant_count: db.parts.filter((p) => p.conversation_id === c.id && !p.is_blocked).length, created_at: c.created_at })
const msgJson = (m, viewer) => {
  const r = m.reply_to && db.msgs.find((x) => x.id === m.reply_to)
  if (m.deleted_at) return { id: m.id, deleted: true, deleted_by: m.deleted_by, role: m.sender_role, name: m.sender_name, created_at: m.created_at, updated_at: m.updated_at, mine: m.participant_id === viewer }
  return { id: m.id, role: m.sender_role, participant_id: m.participant_id, name: m.sender_name, body: m.body, image_path: m.image_path, reply_to: m.reply_to,
    reply: r ? { id: r.id, name: r.sender_name, body: r.body, has_image: !!r.image_path } : null, is_announcement: m.is_announcement, is_pinned: m.is_pinned,
    is_featured: m.is_featured, deleted: false, created_at: m.created_at, updated_at: m.updated_at, mine: !!m.participant_id && m.participant_id === viewer }
}
class PgErr extends Error { constructor(msg, code = 'P0001') { super(msg); this.code = code } }
const auth = (token) => {
  const pid = db.tokens.get(token); const p = db.parts.find((x) => x.id === pid)
  if (!p) throw new PgErr('انتهت الجلسة، ادخل من جديد', 'P0002')
  return { p, c: db.convs.find((c) => c.id === p.conversation_id) }
}
const sessionJson = (p, c, token) => ({ token, participant: { id: p.id, name: p.name, upload_key: p.upload_key, is_blocked: p.is_blocked }, conversation: { ...convJson(c), secret_key: c.secret_key, slug: c.slug } })
const tables = { tw_teachers: 'teachers', tw_conversations: 'convs', tw_participants: 'parts', tw_roster: 'roster', tw_messages: 'msgs', tw_reports: 'reports' }

const rpc = {
  tw_conv_public: ({ p_slug }) => { const c = db.convs.find((x) => x.slug === p_slug); return c ? { title: c.title, description: c.description, grade: c.grade, access_mode: c.access_mode, status: status(c), teacher_name: teacherName(c) } : null },
  tw_join: ({ p_slug, p_name, p_code }) => {
    const c = db.convs.find((x) => x.slug === p_slug); if (!c) throw new PgErr('رابط المحادثة غير صحيح')
    const name = (p_name || '').trim().replace(/\s+/g, ' ')
    if (name.length < 2) throw new PgErr('اكتب اسمك (حرفان على الأقل)')
    if (c.access_mode !== 'open') {
      const r = db.roster.find((x) => x.conversation_id === c.id && norm(x.name) === norm(name))
      if (!r || (c.access_mode === 'code' && r.code !== (p_code || '').trim())) throw new PgErr('الاسم أو رمز الدخول غير صحيح')
    }
    let p = db.parts.find((x) => x.conversation_id === c.id && norm(x.name) === norm(name))
    if (p && c.access_mode === 'open') throw new PgErr('هذا الاسم مستخدم بالفعل في المحادثة. إن كنت أنت، فادخل من جهازك نفسه، أو أضف اسم العائلة')
    if (!p) { p = { id: randomUUID(), conversation_id: c.id, roster_id: null, name, upload_key: randomUUID(), is_blocked: false, is_demo: false, joined_at: now(), last_seen_at: now() }; db.parts.push(p) }
    const token = randomBytes(16).toString('hex'); db.tokens.set(token, p.id)
    return sessionJson(p, c, token)
  },
  tw_resume: ({ p_token }) => { const { p, c } = auth(p_token); return sessionJson(p, c, p_token) },
  tw_feed: ({ p_token, p_since }) => {
    const { p, c } = auth(p_token)
    return { server_time: now(), conversation: convJson(c), me: { id: p.id, name: p.name, is_blocked: p.is_blocked },
      messages: db.msgs.filter((m) => m.conversation_id === c.id && (!p_since || m.updated_at > p_since)).map((m) => msgJson(m, p.id)) }
  },
  tw_send: ({ p_token, p_body, p_image_path, p_reply_to }) => {
    const { p, c } = auth(p_token)
    if (status(c) !== 'open') throw new PgErr('المحادثة مغلقة، لا يمكن إرسال رسائل جديدة')
    if (p_image_path && (!p_image_path.startsWith(`${c.secret_key}/${p.upload_key}/`) || !db.objects.has(p_image_path))) throw new PgErr('مسار الصورة غير صالح')
    const m = { id: randomUUID(), conversation_id: c.id, participant_id: p.id, sender_role: 'student', sender_name: p.name, body: p_body, image_path: p_image_path, reply_to: p_reply_to,
      is_announcement: false, is_pinned: false, is_featured: false, deleted_at: null, deleted_by: null, created_at: ts(), updated_at: now() }
    m.updated_at = m.created_at; db.msgs.push(m); return msgJson(m, p.id)
  },
  tw_report: ({ p_token, p_message_id }) => { const { p, c } = auth(p_token); db.reports.push({ id: randomUUID(), message_id: p_message_id, conversation_id: c.id, participant_id: p.id, reason: null, resolved: false, created_at: now() }); return null },
  tw_delete_own: ({ p_token, p_message_id }) => { const { p } = auth(p_token); const m = db.msgs.find((x) => x.id === p_message_id && x.participant_id === p.id); if (!m) throw new PgErr('لا يمكنك حذف هذه الرسالة'); m.deleted_at = now(); m.deleted_by = 'student'; m.updated_at = now(); return null },
  tw_dashboard: () => db.convs.filter((c) => c.owner_id === UID).map((c) => {
    const ms = db.msgs.filter((m) => m.conversation_id === c.id && !m.deleted_at)
    return { ...c, status: status(c), participant_count: db.parts.filter((p) => p.conversation_id === c.id).length, message_count: ms.length,
      unread_count: ms.filter((m) => m.sender_role === 'student' && m.created_at > c.teacher_last_read_at).length,
      report_count: db.reports.filter((r) => r.conversation_id === c.id && !r.resolved).length, last_message_at: ms.at(-1)?.created_at || null }
  }),
  tw_seed_demo: () => null, tw_clear_demo: () => 0,
}

function applyFilters(rows, sp) {
  let out = rows
  for (const [k, v] of sp) {
    if (['select', 'order', 'limit', 'on_conflict', 'columns'].includes(k)) continue
    const [op, ...rest] = v.split('.'); const val = rest.join('.')
    out = out.filter((r) => {
      const x = r[k]; const cmp = val === 'true' ? true : val === 'false' ? false : val
      if (op === 'eq') return String(x) === String(cmp)
      if (op === 'gt') return x > cmp
      return true
    })
  }
  const order = sp.get('order'); if (order) { const [col, dir] = order.split('.'); out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (dir === 'desc' ? -1 : 1)) }
  return out
}

function teacherBefore(table, row) {
  if (table === 'convs') Object.assign(row, { id: randomUUID(), owner_id: UID, slug: randomBytes(5).toString('hex'), secret_key: randomUUID(), is_closed: row.is_closed ?? false, is_archived: false,
    teacher_last_read_at: now(), is_demo: false, created_at: now(), updated_at: now(), description: row.description ?? null, grade: row.grade ?? null, expires_at: row.expires_at ?? null })
  if (table === 'msgs') Object.assign(row, { id: randomUUID(), participant_id: null, sender_name: db.teachers[0]?.display_name || 'المعلم', is_pinned: false, is_featured: false,
    deleted_at: null, deleted_by: null, created_at: ts(), reply_to: row.reply_to ?? null, image_path: row.image_path ?? null, is_announcement: !!row.is_announcement })
  if (table === 'msgs') row.updated_at = row.created_at
  if (table === 'roster') Object.assign(row, { id: randomUUID(), code: String(Math.floor(100000 + Math.random() * 899999)), created_at: now() })
  return row
}

async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const path = url.pathname; const method = req.method()
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  const body = () => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } }
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  try {
    if (path === '/auth/v1/token') {
      const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'teacher@school.test', user_metadata: { tw_display_name: 'أ. حسن' }, app_metadata: {} }
      return json({ access_token: 'teacher-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user })
    }
    if (path === '/auth/v1/user') return json({ id: UID, aud: 'authenticated', role: 'authenticated', email: 'teacher@school.test', user_metadata: { tw_display_name: 'أ. حسن' } })
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (path.startsWith('/rest/v1/rpc/')) {
      const fn = path.split('/').pop()
      try { return json(rpc[fn](body())) } catch (e) { return json({ message: e.message, code: e.code || 'P0001' }, 400) }
    }
    if (path.startsWith('/rest/v1/')) {
      const t = tables[path.split('/').pop()]; const list = db[t]
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      const reply = (rows) => single ? (rows[0] ? json(rows[0]) : json({ message: 'not found', code: 'PGRST116' }, 406)) : json(rows)
      if (method === 'GET') return reply(applyFilters(list, url.searchParams))
      if (method === 'POST') {
        const b = body(); const rows = (Array.isArray(b) ? b : [b]).map((r) => (t === 'teachers' ? { ...r, created_at: now() } : teacherBefore(t, { ...r })))
        if (t === 'teachers') { db.teachers = db.teachers.filter((x) => !rows.some((r) => r.id === x.id)) ; db.teachers.push(...rows) } else list.push(...rows)
        return reply(rows)
      }
      if (method === 'PATCH') { const rows = applyFilters(list, url.searchParams); const b = body(); rows.forEach((r) => Object.assign(r, b, { updated_at: now() })); if (t === 'roster' && b.code === '') rows.forEach((r) => (r.code = String(Math.floor(100000 + Math.random() * 899999)))); return reply(rows) }
      if (method === 'DELETE') { const rows = applyFilters(list, url.searchParams); db[t] = list.filter((r) => !rows.includes(r)); return reply(rows) }
    }
    if (path.startsWith('/storage/v1/object/sign/tw-images') && method === 'POST' && path === '/storage/v1/object/sign/tw-images') {
      const { paths } = body(); return json(paths.map((p) => ({ path: p, signedURL: `/object/sign/tw-images/${p}?token=t`, error: db.objects.has(p) ? null : 'not found' })))
    }
    if (path.startsWith('/storage/v1/object/sign/tw-images/') || (method === 'GET' && path.startsWith('/storage/v1/object/tw-images/'))) {
      const p = decodeURIComponent(path.replace(/^\/storage\/v1\/object\/(sign\/)?tw-images\//, '')); const o = db.objects.get(p)
      return o ? route.fulfill({ status: 200, contentType: o.type, body: o.buf }) : json({ message: 'not found' }, 404)
    }
    if (path.startsWith('/storage/v1/object/list/tw-images')) return json([])
    if (path.startsWith('/storage/v1/object/tw-images/') && method === 'POST') {
      const p = decodeURIComponent(path.replace('/storage/v1/object/tw-images/', '')); let buf = req.postDataBuffer() || Buffer.alloc(0)
      // storage-js يرسل الصورة داخل multipart/form-data: نستخرج بايتات JPEG
      const a = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff])), z = buf.lastIndexOf(Buffer.from([0xff, 0xd9]))
      if (a >= 0 && z > a) buf = buf.subarray(a, z + 2)
      db.objects.set(p, { buf, type: 'image/jpeg' }); return json({ Key: `tw-images/${p}`, Id: randomUUID() })
    }
    if (path.startsWith('/storage/v1/object/tw-images') && method === 'DELETE') return json([])
    return json({ message: 'mock: unhandled ' + method + ' ' + path }, 404)
  } catch (e) { console.error('mock error', e); return json({ message: String(e) }, 500) }
}

// ---------------- السيناريو ----------------
const results = []
const step = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`) }
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const ctx = async (opts = {}) => { const c = await browser.newContext({ locale: 'ar', ...opts }); await c.route(`${SB}/**`, handle); await c.routeWebSocket?.(/realtime/, (ws) => ws.close()); return c }
const errors = []
const watch = (page, who) => { page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`)); page.on('console', (m) => m.type() === 'error' && !/WebSocket|realtime|Failed to load resource/.test(m.text()) && errors.push(`${who} console: ${m.text()}`)) }

try {
  // 1) المعلم يدخل حسابه
  const tctx = await ctx({ viewport: { width: 1280, height: 820 } }); const T = await tctx.newPage(); watch(T, 'teacher')
  await T.goto(`${BASE}/login`)
  await T.fill('#em', 'teacher@school.test'); await T.fill('#pw', 'secret123')
  await T.click('button:has-text("دخول")')
  await T.waitForURL('**/t'); await T.getByText('مرحبًا أ. حسن').waitFor()
  step('1. المعلم يدخل إلى حسابه', true)
  await T.screenshot({ path: `${OUT}/01-dashboard-empty.png` })

  // 2) ينشئ محادثة «التوكل على الله»
  await T.click('button:has-text("إنشاء محادثة جديدة")')
  await T.fill('#t', 'التوكل على الله'); await T.fill('#d', 'اكتب معنى التوكل وصورة من دفترك'); await T.selectOption('#g', 'الصف الخامس')
  await T.screenshot({ path: `${OUT}/02-new-conversation.png` })
  await T.click('button:has-text("إنشاء المحادثة")')
  await T.getByText('المحادثة جاهزة').waitFor()
  // 3) يحصل على الرابط
  const link = (await T.locator('[dir=ltr].truncate').first().textContent()).trim()
  step('2-3. إنشاء المحادثة والحصول على الرابط وQR', /\/j\/[a-f0-9]+$/.test(link), link)
  await T.waitForSelector('img[alt="رمز QR للدخول السريع"]')
  await T.screenshot({ path: `${OUT}/03-share-link-qr.png` })
  await T.click('button:has-text("فتح المحادثة")'); await T.waitForURL('**/t/c/**')

  // 5) أحمد يدخل من آيفون
  const actx = await ctx({ ...devices['iPhone 13'] }); const A = await actx.newPage(); watch(A, 'ahmad')
  await A.goto(link); await A.getByText('اكتب اسمك قبل الدخول').waitFor()
  await A.fill('#sn', '   '); await A.click('button:has-text("الدخول إلى المحادثة")')
  const emptyBlocked = await A.getByRole('alert').textContent()
  step('4. منع الدخول باسم فارغ أو مسافات', /اكتب اسمك/.test(emptyBlocked), emptyBlocked)
  await A.screenshot({ path: `${OUT}/04-student-welcome-iphone.png` })
  await A.fill('#sn', 'أحمد'); await A.click('button:has-text("الدخول إلى المحادثة")')
  await A.getByText('أهلًا أحمد').waitFor()
  step('5. يدخل الطالب أحمد', true)

  // 6) محمد يدخل من جهاز آخر (كمبيوتر مع كاميرا)
  const mctx = await ctx({ viewport: { width: 1024, height: 760 }, permissions: ['camera'] }); const M = await mctx.newPage(); watch(M, 'mohammad')
  await M.goto(link); await M.fill('#sn', 'محمد'); await M.click('button:has-text("الدخول إلى المحادثة")')
  await M.getByText('أهلًا محمد').waitFor()
  // محاولة انتحال اسم أحمد
  const xctx = await ctx(); const X = await xctx.newPage(); await X.goto(link); await X.fill('#sn', 'احمد'); await X.click('button:has-text("الدخول إلى المحادثة")')
  const dup = await X.getByRole('alert').textContent(); await xctx.close()
  step('6. يدخل محمد، ويُمنع تكرار اسم «أحمد» من جهاز ثالث', /مستخدم بالفعل/.test(dup))

  // 7) أحمد يرسل رسالة نصية
  await A.fill('textarea', 'التوكل هو الاعتماد على الله مع الأخذ بالأسباب'); await A.click('button[aria-label="إرسال"]')
  await A.getByText('التوكل هو الاعتماد على الله').first().waitFor()
  step('7. أحمد يرسل رسالة نصية', true)
  await A.screenshot({ path: `${OUT}/05-ahmad-sent-iphone.png` })

  // 8) محمد يلتقط صورة بالكاميرا ويرسلها
  await M.click('button[aria-label="فتح الكاميرا"]'); await M.getByText('التقاط صورة').waitFor()
  await M.waitForFunction(() => { const v = document.querySelector('video'); return v && v.videoWidth > 0 })
  await M.screenshot({ path: `${OUT}/06-camera.png` })
  await M.click('button[aria-label="التقاط"]')
  await M.getByText('معاينة الصورة').first().waitFor()
  await M.fill('textarea', 'هذه صورة من دفتري')
  await M.screenshot({ path: `${OUT}/07-image-preview.png` })
  await M.click('button[aria-label="إرسال"]')
  await M.waitForSelector('img[alt="صورة من محمد"]')
  step('8. محمد يلتقط صورة بالكاميرا ويعاينها ثم يرسلها', db.objects.size === 1 && db.msgs.some((m) => m.image_path))

  // 9) المعلم يرى الرسالتين والصورة دون إعادة تحميل
  await T.getByText('التوكل هو الاعتماد على الله').waitFor({ timeout: 12000 })
  await T.waitForSelector('img[alt="صورة من محمد"]', { timeout: 12000 })
  step('9. المعلم يرى الرسالتين والصورة تلقائيًا دون تحديث الصفحة', true)
  await T.screenshot({ path: `${OUT}/08-teacher-sees-messages.png` })
  await T.click('img[alt="صورة من محمد"]'); await T.waitForSelector('[role=dialog] img[alt="صورة من محمد"]')
  await T.screenshot({ path: `${OUT}/09-teacher-lightbox.png` }); await T.click('button[aria-label="إغلاق"]')

  // 10) المعلم يرد على الطالبين
  const replyTo = async (text, answer) => {
    const bubble = T.locator(`[id^="m-"]:has-text("${text}")`).first()
    await bubble.hover(); await bubble.locator('button[aria-label="خيارات الرسالة"]').click()
    await T.click('button:has-text("رد على الرسالة")')
    await T.fill('textarea', answer); await T.click('button[aria-label="إرسال"]'); await T.getByText(answer).first().waitFor()
  }
  await replyTo('التوكل هو الاعتماد', 'أحسنت يا أحمد، تعريف دقيق 👏')
  await replyTo('هذه صورة من دفتري', 'صورة رائعة يا محمد، خط جميل')
  // تمييز إجابة أحمد وتثبيتها
  const b = T.locator('[id^="m-"]:has-text("التوكل هو الاعتماد")').first(); await b.hover(); await b.locator('button[aria-label="خيارات الرسالة"]').click()
  await T.click('button:has-text("تمييز كـ«إجابة مميزة»")')
  await A.getByText('أحسنت يا أحمد').waitFor({ timeout: 12000 }); await M.getByText('صورة رائعة يا محمد').waitFor({ timeout: 12000 })
  await A.getByText('إجابة مميزة').first().waitFor({ timeout: 12000 })
  step('10. المعلم يرد على الطالبين، والردود تصل لأجهزتهم فورًا', true)
  await T.screenshot({ path: `${OUT}/10-teacher-replied.png` })
  await A.screenshot({ path: `${OUT}/11-ahmad-sees-reply-iphone.png` })
  await M.screenshot({ path: `${OUT}/12-mohammad-sees-reply.png` })

  // البحث داخل الرسائل
  await T.click('button[aria-label="بحث في الرسائل"]'); await T.fill('input[placeholder^="ابحث في الرسائل"]', 'دفتري')
  const found = await T.locator('[id^="m-"]').count()
  step('البحث داخل الرسائل', found === 1, `${found} نتيجة`)
  await T.click('button[aria-label="إغلاق البحث"]')

  // إغلاق المحادثة يمنع الإرسال
  await T.click('button[aria-label="إغلاق المحادثة"]'); await T.click('[role=dialog] button:has-text("إغلاق")')
  await A.getByText('أغلق المعلم المحادثة').waitFor({ timeout: 12000 })
  step('إغلاق المحادثة يمنع الطلاب من الإرسال', true)
  await A.screenshot({ path: `${OUT}/13-closed-student-iphone.png` })
  await T.click('button[aria-label="إعادة فتح المحادثة"]'); await A.locator('textarea').waitFor({ timeout: 12000 })

  // 11-12) إغلاق الموقع وإعادة فتحه
  await T.close()
  const T2 = await tctx.newPage(); watch(T2, 'teacher2'); await T2.goto(`${BASE}/t`)
  await T2.getByText('التوكل على الله').first().waitFor()
  await T2.screenshot({ path: `${OUT}/14-dashboard-after-reopen.png` })
  await T2.click('a:has-text("فتح المحادثة")')
  await T2.getByText('التوكل هو الاعتماد على الله').first().waitFor(); await T2.waitForSelector('img[alt="صورة من محمد"]'); await T2.getByText('صورة رائعة يا محمد').first().waitFor()
  step('11-12. بعد إغلاق الموقع وفتحه: المحادثة والرسائل والصور محفوظة', true)
  // الطالب يحدّث الصفحة فيبقى داخل المحادثة دون كتابة اسمه
  await A.reload(); await A.getByText('التوكل هو الاعتماد على الله').first().waitFor()
  step('الطالب يحدّث الصفحة ويبقى داخل المحادثة باسمه', !(await A.locator('#sn').count()))
  // لوحة الطلاب
  await T2.click('button:has-text("الطلاب 2")'); await T2.getByText('دخل').first().waitFor()
  await T2.screenshot({ path: `${OUT}/15-students-panel.png` })
  // صفحة التصدير
  await T2.goto(T2.url().replace(/\/?$/, '') + '/export'); await T2.getByText('الطلاب المشاركون').waitFor(); await T2.waitForSelector('img[alt="صورة من محمد"]')
  await T2.pdf?.({ path: `${OUT}/التوكل-على-الله.pdf`, format: 'A4', printBackground: true })
  const [dl] = await Promise.all([T2.waitForEvent('download'), T2.click('button:has-text("Excel")')])
  await dl.saveAs(`${OUT}/${dl.suggestedFilename()}`)
  step('التصدير إلى PDF و Excel', true, dl.suggestedFilename())
} catch (e) {
  step('خطأ أثناء السيناريو', false, e.message.split('\n')[0])
} finally {
  if (errors.length) console.log('أخطاء المتصفح:\n' + errors.join('\n'))
  await browser.close()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} خطوة ناجحة`)
  process.exit(failed || errors.length ? 1 : 0)
}
