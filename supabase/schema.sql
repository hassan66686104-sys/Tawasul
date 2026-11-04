-- =====================================================================
-- «تواصل – مساحة التعلم» : مخطط قاعدة البيانات الكامل
-- يُشغَّل مرة واحدة في Supabase → SQL Editor (آمن للتشغيل المتكرر).
-- كل الكائنات ببادئة tw_ حتى لا تتعارض مع أي جداول أخرى في المشروع.
-- =====================================================================

-- ---------- الجداول ----------
create table if not exists public.tw_teachers (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  created_at timestamptz not null default now()
);

create or replace function public.tw_gen_slug()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  b bytea := extensions.gen_random_bytes(10);
  s text := '';
  i int;
begin
  for i in 0..9 loop
    s := s || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return s;
end $$;

create table if not exists public.tw_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null unique default public.tw_gen_slug(),
  secret_key uuid not null unique default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 500),
  grade text check (grade is null or char_length(grade) <= 60),
  access_mode text not null default 'open' check (access_mode in ('open','roster','code')),
  is_closed boolean not null default false,
  is_archived boolean not null default false,
  expires_at timestamptz,
  teacher_last_read_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tw_conversations_owner_idx on public.tw_conversations(owner_id, created_at desc);

create table if not exists public.tw_roster (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tw_conversations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  name_norm text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, name_norm)
);

create table if not exists public.tw_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tw_conversations(id) on delete cascade,
  roster_id uuid references public.tw_roster(id) on delete set null,
  name text not null,
  name_norm text not null,
  upload_key uuid not null default gen_random_uuid(),
  is_blocked boolean not null default false,
  is_demo boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (conversation_id, name_norm)
);

create table if not exists public.tw_tokens (
  token_hash text primary key,
  participant_id uuid not null references public.tw_participants(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists tw_tokens_participant_idx on public.tw_tokens(participant_id);

create table if not exists public.tw_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tw_conversations(id) on delete cascade,
  participant_id uuid references public.tw_participants(id) on delete cascade,
  sender_role text not null check (sender_role in ('teacher','student')),
  sender_name text not null default '',
  body text check (body is null or char_length(body) <= 2000),
  image_path text,
  reply_to uuid references public.tw_messages(id) on delete set null,
  is_announcement boolean not null default false,
  is_pinned boolean not null default false,
  is_featured boolean not null default false,
  deleted_at timestamptz,
  deleted_by text check (deleted_by is null or deleted_by in ('teacher','student')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(btrim(body), '') <> '' or image_path is not null),
  check ((sender_role = 'teacher') = (participant_id is null))
);
create index if not exists tw_messages_conv_idx on public.tw_messages(conversation_id, created_at);
create index if not exists tw_messages_conv_upd_idx on public.tw_messages(conversation_id, updated_at);
create index if not exists tw_messages_participant_idx on public.tw_messages(participant_id, created_at);

create table if not exists public.tw_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.tw_messages(id) on delete cascade,
  conversation_id uuid not null references public.tw_conversations(id) on delete cascade,
  participant_id uuid not null references public.tw_participants(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (message_id, participant_id)
);

create table if not exists public.tw_join_attempts (
  id bigint generated always as identity primary key,
  conversation_id uuid references public.tw_conversations(id) on delete cascade,
  ip text,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists tw_join_attempts_idx on public.tw_join_attempts(conversation_id, at);

-- ---------- دوال مساعدة ----------
-- توحيد الأسماء العربية: إزالة التشكيل والتطويل وتوحيد الهمزات والمسافات
create or replace function public.tw_norm(p text)
returns text language sql immutable set search_path = '' as $$
  select lower(
    translate(
      regexp_replace(
        regexp_replace(btrim(coalesce(p, '')), '[ً-ٰٟـ]', '', 'g'),
        '\s+', ' ', 'g'),
      'أإآٱىةؤئ', 'اااايهوي'))
$$;

-- تنظيف الاسم المعروض
create or replace function public.tw_clean_name(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]<>]', '', 'g')), '\s+', ' ', 'g')
$$;

create or replace function public.tw_hash(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

create or replace function public.tw_status(c public.tw_conversations)
returns text language sql stable set search_path = '' as $$
  select case
    when c.is_archived then 'archived'
    when c.is_closed then 'closed'
    when c.expires_at is not null and c.expires_at <= now() then 'expired'
    else 'open' end
$$;

create or replace function public.tw_is_owner(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tw_conversations c where c.id = p_conv and c.owner_id = auth.uid())
$$;

create or replace function public.tw_ip()
returns text language sql stable set search_path = '' as $$
  select nullif(split_part(coalesce((nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for'), ''), ',', 1), '')
$$;

-- البث اللحظي: إشعار خفيف على قناة سرية خاصة بكل محادثة
create or replace function public.tw_notify(p_secret uuid, p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind', p_kind, 'id', p_id, 'at', now()), 'sync', 'tw:' || p_secret::text, false);
exception when others then
  raise warning 'tw_notify failed: %', sqlerrm;
end $$;

-- ---------- المشغّلات ----------
create or replace function public.tw_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tw_conversations_touch on public.tw_conversations;
create trigger tw_conversations_touch before update on public.tw_conversations
  for each row execute function public.tw_touch();
drop trigger if exists tw_messages_touch on public.tw_messages;
create trigger tw_messages_touch before update on public.tw_messages
  for each row execute function public.tw_touch();

-- قبل إدراج رسالة المعلم: اسم المعلم والتحقق من مسار الصورة
create or replace function public.tw_messages_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
begin
  if new.sender_role = 'teacher' then
    select c.secret_key into v_secret from public.tw_conversations c where c.id = new.conversation_id;
    select coalesce(t.display_name, 'المعلم') into new.sender_name
      from public.tw_teachers t join public.tw_conversations c on c.owner_id = t.id
      where c.id = new.conversation_id;
    new.sender_name := coalesce(new.sender_name, 'المعلم');
    if new.image_path is not null and new.image_path !~ ('^' || v_secret::text || '/teacher/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$') then
      raise exception 'مسار الصورة غير صالح';
    end if;
    new.is_pinned := coalesce(new.is_pinned, false);
  else
    new.is_announcement := false;
  end if;
  new.created_at := now();
  new.updated_at := now();
  new.deleted_at := null;
  return new;
end $$;

drop trigger if exists tw_messages_bi on public.tw_messages;
create trigger tw_messages_bi before insert on public.tw_messages
  for each row execute function public.tw_messages_before_insert();

create or replace function public.tw_messages_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  select secret_key into v_secret from public.tw_conversations where id = new.conversation_id;
  perform public.tw_notify(v_secret, 'msg', new.id);
  return null;
end $$;

drop trigger if exists tw_messages_ai on public.tw_messages;
create trigger tw_messages_ai after insert or update on public.tw_messages
  for each row execute function public.tw_messages_after();

create or replace function public.tw_conversations_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.tw_notify(new.secret_key, 'conv', new.id);
  return null;
end $$;

drop trigger if exists tw_conversations_au on public.tw_conversations;
create trigger tw_conversations_au
  after update of title, description, grade, access_mode, is_closed, is_archived, expires_at on public.tw_conversations
  for each row execute function public.tw_conversations_after();

create or replace function public.tw_participants_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  select secret_key into v_secret from public.tw_conversations where id = new.conversation_id;
  perform public.tw_notify(v_secret, 'participant', new.id);
  return null;
end $$;

drop trigger if exists tw_participants_aiu on public.tw_participants;
create trigger tw_participants_aiu after insert or update of is_blocked on public.tw_participants
  for each row execute function public.tw_participants_after();

create or replace function public.tw_reports_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  select secret_key into v_secret from public.tw_conversations where id = new.conversation_id;
  perform public.tw_notify(v_secret, 'report', new.message_id);
  return null;
end $$;

drop trigger if exists tw_reports_ai on public.tw_reports;
create trigger tw_reports_ai after insert on public.tw_reports
  for each row execute function public.tw_reports_after();

-- رموز الدخول الفردية: توليد تلقائي (6 أرقام) وتوحيد الاسم
create or replace function public.tw_roster_before()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.name := public.tw_clean_name(new.name);
  new.name_norm := public.tw_norm(new.name);
  if new.code is null or btrim(new.code) = '' then
    declare b bytea := extensions.gen_random_bytes(3);
    begin
      new.code := lpad(((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 1000000)::text, 6, '0');
    end;
  end if;
  new.code := btrim(new.code);
  return new;
end $$;

drop trigger if exists tw_roster_biu on public.tw_roster;
create trigger tw_roster_biu before insert or update on public.tw_roster
  for each row execute function public.tw_roster_before();

-- ---------- الصلاحيات و RLS ----------
alter table public.tw_teachers enable row level security;
alter table public.tw_conversations enable row level security;
alter table public.tw_roster enable row level security;
alter table public.tw_participants enable row level security;
alter table public.tw_tokens enable row level security;
alter table public.tw_messages enable row level security;
alter table public.tw_reports enable row level security;
alter table public.tw_join_attempts enable row level security;

-- الطلاب (anon) لا يصلون لأي جدول مباشرة؛ كل وصولهم عبر دوال RPC محكومة
revoke all on public.tw_teachers, public.tw_conversations, public.tw_roster, public.tw_participants,
  public.tw_tokens, public.tw_messages, public.tw_reports, public.tw_join_attempts from anon, authenticated;

grant select, insert, update on public.tw_teachers to authenticated;
grant select, delete on public.tw_conversations to authenticated;
grant insert (title, description, grade, access_mode, expires_at, is_closed) on public.tw_conversations to authenticated;
grant update (title, description, grade, access_mode, expires_at, is_closed, is_archived, teacher_last_read_at) on public.tw_conversations to authenticated;
grant select, insert, update, delete on public.tw_roster to authenticated;
grant select on public.tw_participants to authenticated;
grant update (is_blocked) on public.tw_participants to authenticated;
grant select on public.tw_messages to authenticated;
grant insert (conversation_id, sender_role, body, image_path, reply_to, is_announcement, is_pinned) on public.tw_messages to authenticated;
grant update (is_pinned, is_featured, deleted_at, deleted_by) on public.tw_messages to authenticated;
grant select on public.tw_reports to authenticated;
grant update (resolved) on public.tw_reports to authenticated;

drop policy if exists tw_teachers_self on public.tw_teachers;
create policy tw_teachers_self on public.tw_teachers for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists tw_conv_owner on public.tw_conversations;
create policy tw_conv_owner on public.tw_conversations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists tw_roster_owner on public.tw_roster;
create policy tw_roster_owner on public.tw_roster for all to authenticated
  using (public.tw_is_owner(conversation_id)) with check (public.tw_is_owner(conversation_id));

drop policy if exists tw_participants_owner on public.tw_participants;
create policy tw_participants_owner on public.tw_participants for all to authenticated
  using (public.tw_is_owner(conversation_id)) with check (public.tw_is_owner(conversation_id));

drop policy if exists tw_messages_owner_sel on public.tw_messages;
create policy tw_messages_owner_sel on public.tw_messages for select to authenticated
  using (public.tw_is_owner(conversation_id));
drop policy if exists tw_messages_owner_ins on public.tw_messages;
create policy tw_messages_owner_ins on public.tw_messages for insert to authenticated
  with check (public.tw_is_owner(conversation_id) and sender_role = 'teacher' and participant_id is null);
drop policy if exists tw_messages_owner_upd on public.tw_messages;
create policy tw_messages_owner_upd on public.tw_messages for update to authenticated
  using (public.tw_is_owner(conversation_id)) with check (public.tw_is_owner(conversation_id));

drop policy if exists tw_reports_owner on public.tw_reports;
create policy tw_reports_owner on public.tw_reports for all to authenticated
  using (public.tw_is_owner(conversation_id)) with check (public.tw_is_owner(conversation_id));
-- tw_tokens و tw_join_attempts: بلا سياسات = لا وصول إلا عبر الدوال

-- ---------- دوال الطلاب (RPC) ----------
create or replace function public.tw_conv_json(c public.tw_conversations)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'grade', c.grade,
    'access_mode', c.access_mode, 'status', public.tw_status(c), 'expires_at', c.expires_at,
    'teacher_name', coalesce((select t.display_name from public.tw_teachers t where t.id = c.owner_id), 'المعلم'),
    'participant_count', (select count(*) from public.tw_participants p where p.conversation_id = c.id and not p.is_blocked),
    'created_at', c.created_at)
$$;

-- معلومات شاشة الترحيب (بلا أي معرفات سرية)
create or replace function public.tw_conv_public(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.tw_conversations;
begin
  select * into c from public.tw_conversations where slug = lower(btrim(p_slug));
  if not found then return null; end if;
  return jsonb_build_object(
    'title', c.title, 'description', c.description, 'grade', c.grade, 'access_mode', c.access_mode,
    'status', public.tw_status(c),
    'teacher_name', coalesce((select t.display_name from public.tw_teachers t where t.id = c.owner_id), 'المعلم'));
end $$;

create or replace function public.tw_session_json(p public.tw_participants, c public.tw_conversations, p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'token', p_token,
    'participant', jsonb_build_object('id', p.id, 'name', p.name, 'upload_key', p.upload_key, 'is_blocked', p.is_blocked),
    'conversation', public.tw_conv_json(c) || jsonb_build_object('secret_key', c.secret_key, 'slug', c.slug))
$$;

create or replace function public.tw_join(p_slug text, p_name text, p_code text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.tw_conversations;
  p public.tw_participants;
  r public.tw_roster;
  v_name text := public.tw_clean_name(p_name);
  v_norm text := public.tw_norm(p_name);
  v_token text;
  v_ip text := public.tw_ip();
begin
  select * into c from public.tw_conversations where slug = lower(btrim(p_slug));
  if not found then raise exception 'رابط المحادثة غير صحيح' using errcode = 'P0001'; end if;
  if c.is_archived then raise exception 'هذه المحادثة مؤرشفة ولم تعد متاحة' using errcode = 'P0001'; end if;
  if char_length(v_name) < 2 then raise exception 'اكتب اسمك (حرفان على الأقل)' using errcode = 'P0001'; end if;
  if char_length(v_name) > 40 then raise exception 'الاسم طويل جدًا' using errcode = 'P0001'; end if;
  if v_name !~ '[A-Za-z\u0621-\u064A]' then raise exception 'اكتب اسمًا صحيحًا' using errcode = 'P0001'; end if;

  -- حماية من التخمين: حد للمحاولات الفاشلة
  if (select count(*) from public.tw_join_attempts a
      where a.conversation_id = c.id and not a.ok and a.at > now() - interval '10 minutes'
        and (v_ip is null or a.ip = v_ip)) >= 10 then
    raise exception 'محاولات كثيرة غير صحيحة، انتظر قليلًا ثم حاول مجددًا' using errcode = 'P0001';
  end if;

  if c.access_mode in ('roster', 'code') then
    select * into r from public.tw_roster where conversation_id = c.id and name_norm = v_norm;
    if not found or (c.access_mode = 'code' and r.code is distinct from btrim(coalesce(p_code, ''))) then
      insert into public.tw_join_attempts(conversation_id, ip, ok) values (c.id, v_ip, false);
      if c.access_mode = 'code' then
        raise exception 'الاسم أو رمز الدخول غير صحيح' using errcode = 'P0001';
      else
        raise exception 'اسمك غير موجود في قائمة طلاب هذه المحادثة، تأكد من كتابته كما سجّله المعلم' using errcode = 'P0001';
      end if;
    end if;
    v_name := r.name;
  end if;

  select * into p from public.tw_participants where conversation_id = c.id and name_norm = v_norm;
  if found then
    if p.is_blocked then raise exception 'تم إيقاف دخولك إلى هذه المحادثة' using errcode = 'P0001'; end if;
    if c.access_mode = 'open' then
      -- في الوضع المفتوح لا يمكن الدخول باسم مستخدم مسبقًا (منع الانتحال)
      raise exception 'هذا الاسم مستخدم بالفعل في المحادثة. إن كنت أنت، فادخل من جهازك نفسه، أو أضف اسم العائلة' using errcode = 'P0001';
    end if;
  else
    insert into public.tw_participants(conversation_id, roster_id, name, name_norm)
      values (c.id, r.id, v_name, v_norm) returning * into p;
  end if;

  insert into public.tw_join_attempts(conversation_id, ip, ok) values (c.id, v_ip, true);
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.tw_tokens(token_hash, participant_id) values (public.tw_hash(v_token), p.id);
  return public.tw_session_json(p, c, v_token);
end $$;

create or replace function public.tw_auth(p_token text, out p public.tw_participants, out c public.tw_conversations)
language plpgsql stable security definer set search_path = '' as $$
begin
  select pp.* into p from public.tw_tokens t join public.tw_participants pp on pp.id = t.participant_id
    where t.token_hash = public.tw_hash(coalesce(p_token, ''));
  if p.id is null then raise exception 'انتهت الجلسة، ادخل من جديد' using errcode = 'P0002'; end if;
  select * into c from public.tw_conversations where id = p.conversation_id;
end $$;

create or replace function public.tw_resume(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.tw_auth(p_token);
  update public.tw_participants set last_seen_at = now() where id = (a.p).id;
  return public.tw_session_json(a.p, a.c, p_token);
end $$;

create or replace function public.tw_message_json(m public.tw_messages, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when m.deleted_at is not null then
    jsonb_build_object('id', m.id, 'deleted', true, 'deleted_by', m.deleted_by, 'role', m.sender_role,
      'name', m.sender_name, 'created_at', m.created_at, 'updated_at', m.updated_at, 'mine', m.participant_id = p_viewer)
  else jsonb_build_object(
    'id', m.id, 'role', m.sender_role, 'participant_id', m.participant_id, 'name', m.sender_name,
    'body', m.body, 'image_path', m.image_path, 'reply_to', m.reply_to,
    'reply', (select jsonb_build_object('id', r.id, 'name', r.sender_name,
                'body', case when r.deleted_at is null then left(r.body, 140) end,
                'has_image', r.image_path is not null and r.deleted_at is null)
              from public.tw_messages r where r.id = m.reply_to),
    'is_announcement', m.is_announcement, 'is_pinned', m.is_pinned, 'is_featured', m.is_featured,
    'deleted', false, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'mine', m.participant_id is not null and m.participant_id = p_viewer)
  end
$$;

-- سحب الرسائل الجديدة/المعدلة منذ وقت معيّن
create or replace function public.tw_feed(p_token text, p_since timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.tw_auth(p_token);
  return jsonb_build_object(
    'server_time', now(),
    'conversation', public.tw_conv_json(a.c),
    'me', jsonb_build_object('id', (a.p).id, 'name', (a.p).name, 'is_blocked', (a.p).is_blocked),
    'messages', coalesce((
      select jsonb_agg(public.tw_message_json(m, (a.p).id) order by m.created_at)
      from (select * from public.tw_messages mm
            where mm.conversation_id = (a.c).id
              and (p_since is null or mm.updated_at > p_since)
            order by mm.created_at desc limit 1000) m), '[]'::jsonb));
end $$;

create or replace function public.tw_send(p_token text, p_body text, p_image_path text default null, p_reply_to uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  m public.tw_messages;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  select * into a from public.tw_auth(p_token);
  if (a.p).is_blocked then raise exception 'تم إيقاف مشاركتك في هذه المحادثة' using errcode = 'P0001'; end if;
  if public.tw_status(a.c) <> 'open' then raise exception 'المحادثة مغلقة، لا يمكن إرسال رسائل جديدة' using errcode = 'P0001'; end if;
  if v_body is null and p_image_path is null then raise exception 'الرسالة فارغة' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_body, '')) > 2000 then raise exception 'الرسالة طويلة جدًا (الحد 2000 حرف)' using errcode = 'P0001'; end if;
  if p_image_path is not null then
    if p_image_path !~ ('^' || (a.c).secret_key::text || '/' || (a.p).upload_key::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$') then
      raise exception 'مسار الصورة غير صالح' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'tw-images' and o.name = p_image_path) then
      raise exception 'لم يكتمل رفع الصورة' using errcode = 'P0001';
    end if;
  end if;
  if p_reply_to is not null and not exists (select 1 from public.tw_messages r where r.id = p_reply_to and r.conversation_id = (a.c).id) then
    p_reply_to := null;
  end if;
  if (select count(*) from public.tw_messages x where x.participant_id = (a.p).id and x.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'أرسلت رسائل كثيرة بسرعة، انتظر دقيقة' using errcode = 'P0001';
  end if;
  insert into public.tw_messages(conversation_id, participant_id, sender_role, sender_name, body, image_path, reply_to)
    values ((a.c).id, (a.p).id, 'student', (a.p).name, v_body, p_image_path, p_reply_to)
    returning * into m;
  update public.tw_participants set last_seen_at = now() where id = (a.p).id;
  return public.tw_message_json(m, (a.p).id);
end $$;

-- الطالب يحذف رسالته هو فقط
create or replace function public.tw_delete_own(p_token text, p_message_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.tw_auth(p_token);
  update public.tw_messages set deleted_at = now(), deleted_by = 'student', is_pinned = false, is_featured = false
    where id = p_message_id and participant_id = (a.p).id and deleted_at is null;
  if not found then raise exception 'لا يمكنك حذف هذه الرسالة' using errcode = 'P0001'; end if;
end $$;

create or replace function public.tw_report(p_token text, p_message_id uuid, p_reason text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.tw_auth(p_token);
  if not exists (select 1 from public.tw_messages m where m.id = p_message_id and m.conversation_id = (a.c).id) then
    raise exception 'الرسالة غير موجودة' using errcode = 'P0001';
  end if;
  insert into public.tw_reports(message_id, conversation_id, participant_id, reason)
    values (p_message_id, (a.c).id, (a.p).id, left(nullif(btrim(coalesce(p_reason, '')), ''), 300))
    on conflict (message_id, participant_id) do nothing;
end $$;

-- ---------- دوال المعلم ----------
create or replace function public.tw_dashboard()
returns table (
  id uuid, title text, description text, grade text, slug text, access_mode text,
  status text, is_closed boolean, is_archived boolean, expires_at timestamptz, is_demo boolean,
  created_at timestamptz, participant_count bigint, message_count bigint, unread_count bigint,
  report_count bigint, last_message_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.title, c.description, c.grade, c.slug, c.access_mode, public.tw_status(c),
    c.is_closed, c.is_archived, c.expires_at, c.is_demo, c.created_at,
    (select count(*) from public.tw_participants p where p.conversation_id = c.id),
    (select count(*) from public.tw_messages m where m.conversation_id = c.id and m.deleted_at is null),
    (select count(*) from public.tw_messages m where m.conversation_id = c.id and m.deleted_at is null
       and m.sender_role = 'student' and m.created_at > c.teacher_last_read_at),
    (select count(*) from public.tw_reports r where r.conversation_id = c.id and not r.resolved),
    (select max(m.created_at) from public.tw_messages m where m.conversation_id = c.id)
  from public.tw_conversations c
  where c.owner_id = auth.uid()
  order by coalesce((select max(m.created_at) from public.tw_messages m where m.conversation_id = c.id), c.created_at) desc
$$;

-- بيانات تجريبية (قابلة للحذف بزر واحد)
create or replace function public.tw_seed_demo()
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_conv uuid; v_conv2 uuid;
  p1 uuid; p2 uuid; p3 uuid;
  m1 uuid; m2 uuid; m3 uuid;
begin
  if v_uid is null then raise exception 'يجب تسجيل الدخول'; end if;
  insert into public.tw_conversations(owner_id, title, description, grade, is_demo, created_at)
    values (v_uid, 'درس تجريبي: الصدق في القول والعمل', 'محادثة تجريبية لتوضيح طريقة الاستخدام', 'الصف الخامس', true, now() - interval '2 days')
    returning id into v_conv;
  insert into public.tw_participants(conversation_id, name, name_norm, is_demo, joined_at) values
    (v_conv, 'خالد (تجريبي)', public.tw_norm('خالد (تجريبي)'), true, now() - interval '2 days') returning id into p1;
  insert into public.tw_participants(conversation_id, name, name_norm, is_demo, joined_at) values
    (v_conv, 'سارة (تجريبي)', public.tw_norm('سارة (تجريبي)'), true, now() - interval '2 days') returning id into p2;
  insert into public.tw_participants(conversation_id, name, name_norm, is_demo, joined_at) values
    (v_conv, 'يوسف (تجريبي)', public.tw_norm('يوسف (تجريبي)'), true, now() - interval '2 days') returning id into p3;

  insert into public.tw_messages(conversation_id, sender_role, body, is_announcement) values
    (v_conv, 'teacher', 'السلام عليكم يا أبطال، موضوع اليوم: الصدق. اذكر موقفًا كان فيه الصدق صعبًا لكنك التزمت به.', true)
    returning id into m1;
  insert into public.tw_messages(conversation_id, participant_id, sender_role, sender_name, body) values
    (v_conv, p1, 'student', 'خالد (تجريبي)', 'كسرت كوبًا في البيت وأخبرت أمي بالحقيقة مع أنني كنت خائفًا.') returning id into m2;
  insert into public.tw_messages(conversation_id, participant_id, sender_role, sender_name, body) values
    (v_conv, p2, 'student', 'سارة (تجريبي)', 'قال النبي ﷺ: «إن الصدق يهدي إلى البر، وإن البر يهدي إلى الجنة».') returning id into m3;
  insert into public.tw_messages(conversation_id, sender_role, body, reply_to) values
    (v_conv, 'teacher', 'أحسنتِ يا سارة، استشهاد رائع بالحديث الشريف 🌟', m3);
  update public.tw_messages set is_featured = true where id = m3;
  insert into public.tw_messages(conversation_id, participant_id, sender_role, sender_name, body) values
    (v_conv, p3, 'student', 'يوسف (تجريبي)', 'هل الكذب مسموح إذا كان للمزاح؟');
  insert into public.tw_messages(conversation_id, sender_role, body, reply_to) values
    (v_conv, 'teacher', 'سؤال مهم يا يوسف: المؤمن لا يكذب حتى في المزاح، والنبي ﷺ كان يمزح ولا يقول إلا حقًا.', null);
  update public.tw_messages set is_pinned = true where id = m1;
  update public.tw_conversations set teacher_last_read_at = now() - interval '1 day' where id = v_conv;

  insert into public.tw_conversations(owner_id, title, description, grade, is_demo, is_closed, created_at)
    values (v_uid, 'درس تجريبي: بر الوالدين', 'محادثة تجريبية مغلقة', 'الصف السادس', true, true, now() - interval '9 days')
    returning id into v_conv2;
  insert into public.tw_participants(conversation_id, name, name_norm, is_demo) values
    (v_conv2, 'نورة (تجريبي)', public.tw_norm('نورة (تجريبي)'), true) returning id into p1;
  insert into public.tw_messages(conversation_id, sender_role, body) values
    (v_conv2, 'teacher', 'اكتب طريقة واحدة تبرّ بها والديك هذا الأسبوع.');
  insert into public.tw_messages(conversation_id, participant_id, sender_role, sender_name, body) values
    (v_conv2, p1, 'student', 'نورة (تجريبي)', 'سأساعد أمي في ترتيب البيت كل يوم.');
  return v_conv;
end $$;

create or replace function public.tw_clear_demo()
returns int language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  delete from public.tw_conversations where owner_id = auth.uid() and is_demo;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- منح تنفيذ الدوال ----------
revoke execute on function public.tw_join(text, text, text), public.tw_resume(text), public.tw_feed(text, timestamptz),
  public.tw_send(text, text, text, uuid), public.tw_delete_own(text, uuid), public.tw_report(text, uuid, text),
  public.tw_conv_public(text), public.tw_dashboard(), public.tw_seed_demo(), public.tw_clear_demo(),
  public.tw_auth(text), public.tw_notify(uuid, text, uuid), public.tw_conv_json(public.tw_conversations),
  public.tw_session_json(public.tw_participants, public.tw_conversations, text),
  public.tw_message_json(public.tw_messages, uuid), public.tw_is_owner(uuid)
  from public, anon, authenticated;

grant execute on function public.tw_join(text, text, text), public.tw_resume(text), public.tw_feed(text, timestamptz),
  public.tw_send(text, text, text, uuid), public.tw_delete_own(text, uuid), public.tw_report(text, uuid, text),
  public.tw_conv_public(text) to anon, authenticated;
grant execute on function public.tw_dashboard(), public.tw_seed_demo(), public.tw_clear_demo(), public.tw_is_owner(uuid) to authenticated;

-- ---------- التخزين (الصور) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tw-images', 'tw-images', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- قراءة الصور: فقط لمن يعرف المفتاح السري للمحادثة (يُعطى بعد الدخول الصحيح فقط)
create or replace function public.tw_storage_can_read(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tw_conversations c where c.secret_key::text = split_part(p_name, '/', 1))
$$;

-- رفع الصور: طالب مشارك في محادثة مفتوحة، أو المعلم صاحب المحادثة
create or replace function public.tw_storage_can_insert(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-z-]+/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$' and (
    exists (select 1 from public.tw_conversations c join public.tw_participants p on p.conversation_id = c.id
            where c.secret_key::text = split_part(p_name, '/', 1)
              and p.upload_key::text = split_part(p_name, '/', 2)
              and not p.is_blocked and public.tw_status(c) = 'open')
    or exists (select 1 from public.tw_conversations c
            where c.secret_key::text = split_part(p_name, '/', 1)
              and split_part(p_name, '/', 2) = 'teacher' and c.owner_id = auth.uid()))
$$;

create or replace function public.tw_storage_is_owner(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tw_conversations c
    where c.secret_key::text = split_part(p_name, '/', 1) and c.owner_id = auth.uid())
$$;

grant execute on function public.tw_storage_can_read(text), public.tw_storage_can_insert(text) to anon, authenticated;
grant execute on function public.tw_storage_is_owner(text) to authenticated;

drop policy if exists "tw images read" on storage.objects;
create policy "tw images read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'tw-images' and public.tw_storage_can_read(name));
drop policy if exists "tw images upload" on storage.objects;
create policy "tw images upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'tw-images' and public.tw_storage_can_insert(name));
drop policy if exists "tw images delete" on storage.objects;
create policy "tw images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tw-images' and public.tw_storage_is_owner(name));
