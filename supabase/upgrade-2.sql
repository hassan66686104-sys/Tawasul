-- =====================================================================
-- «تواصل» – الترقية 2: معلم واحد، تصويت، إجابات مخفية، تفاعلات، رسائل صوتية،
-- نقاط ولوحة شرف، قوالب الدروس. آمن للتشغيل أكثر من مرة.
-- =====================================================================

-- ---------- 1) معلم واحد فقط ----------
create or replace function public.tw_teachers_single() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.tw_teachers where id <> new.id) then
    raise exception 'هذا الموقع خاص بمعلم واحد، ولا يمكن إنشاء حساب جديد' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tw_teachers_single on public.tw_teachers;
create trigger tw_teachers_single before insert on public.tw_teachers
  for each row execute function public.tw_teachers_single();

create or replace function public.tw_is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tw_teachers where id = auth.uid())
$$;

drop policy if exists tw_conv_owner on public.tw_conversations;
create policy tw_conv_owner on public.tw_conversations for all to authenticated
  using (owner_id = auth.uid() and public.tw_is_teacher())
  with check (owner_id = auth.uid() and public.tw_is_teacher());

-- ---------- 2) أعمدة جديدة ----------
alter table public.tw_conversations add column if not exists hide_answers boolean not null default false;
alter table public.tw_conversations add column if not exists template_id uuid;

alter table public.tw_messages add column if not exists kind text not null default 'text';
alter table public.tw_messages add column if not exists poll_options text[];
alter table public.tw_messages add column if not exists audio_path text;
alter table public.tw_messages add column if not exists audio_secs int;

do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.tw_messages'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%image_path IS NOT NULL%' loop
    execute format('alter table public.tw_messages drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.tw_messages drop constraint if exists tw_messages_content_chk;
alter table public.tw_messages add constraint tw_messages_content_chk check (
  coalesce(btrim(body), '') <> '' or image_path is not null or audio_path is not null);
alter table public.tw_messages drop constraint if exists tw_messages_kind_chk;
alter table public.tw_messages add constraint tw_messages_kind_chk check (
  kind in ('text', 'poll', 'voice')
  and (kind <> 'poll' or (coalesce(btrim(body), '') <> '' and cardinality(poll_options) between 2 and 6))
  and (kind <> 'voice' or audio_path is not null)
  and (audio_secs is null or audio_secs between 0 and 180));

-- ---------- 3) جداول التصويت والتفاعلات والقوالب ----------
create table if not exists public.tw_votes (
  message_id uuid not null references public.tw_messages(id) on delete cascade,
  participant_id uuid not null references public.tw_participants(id) on delete cascade,
  conversation_id uuid not null references public.tw_conversations(id) on delete cascade,
  option smallint not null check (option between 0 and 5),
  created_at timestamptz not null default now(),
  primary key (message_id, participant_id)
);
create index if not exists tw_votes_conv_idx on public.tw_votes(conversation_id);

create table if not exists public.tw_reactions (
  message_id uuid not null references public.tw_messages(id) on delete cascade,
  conversation_id uuid not null references public.tw_conversations(id) on delete cascade,
  participant_id uuid references public.tw_participants(id) on delete cascade,
  actor text not null,              -- 'teacher' أو معرّف الطالب
  emoji text not null check (emoji in ('👍', '❤️', '⭐', '✅', '🤔', '👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, actor, emoji)
);
create index if not exists tw_reactions_conv_idx on public.tw_reactions(conversation_id);

create table if not exists public.tw_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (description is null or char_length(description) <= 500),
  grade text check (grade is null or char_length(grade) <= 60),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tw_votes enable row level security;
alter table public.tw_reactions enable row level security;
alter table public.tw_templates enable row level security;
revoke all on public.tw_votes, public.tw_reactions, public.tw_templates from anon, authenticated;

grant select on public.tw_votes to authenticated;
grant select, delete on public.tw_reactions to authenticated;
grant insert (message_id, emoji) on public.tw_reactions to authenticated;
grant select, insert, update, delete on public.tw_templates to authenticated;

drop policy if exists tw_votes_owner on public.tw_votes;
create policy tw_votes_owner on public.tw_votes for select to authenticated using (public.tw_is_owner(conversation_id));
drop policy if exists tw_reactions_owner on public.tw_reactions;
drop policy if exists tw_reactions_owner_sel on public.tw_reactions;
create policy tw_reactions_owner_sel on public.tw_reactions for select to authenticated
  using (public.tw_is_owner(conversation_id));
drop policy if exists tw_reactions_owner_ins on public.tw_reactions;
create policy tw_reactions_owner_ins on public.tw_reactions for insert to authenticated
  with check (public.tw_is_owner(conversation_id) and actor = 'teacher' and participant_id is null);
drop policy if exists tw_reactions_owner_del on public.tw_reactions;
create policy tw_reactions_owner_del on public.tw_reactions for delete to authenticated
  using (public.tw_is_owner(conversation_id) and actor = 'teacher');
drop policy if exists tw_templates_owner on public.tw_templates;
create policy tw_templates_owner on public.tw_templates for all to authenticated
  using (owner_id = auth.uid() and public.tw_is_teacher())
  with check (owner_id = auth.uid() and public.tw_is_teacher());

-- تفاعل المعلم: تعبئة المحادثة والفاعل تلقائيًا
create or replace function public.tw_reactions_before() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select m.conversation_id into new.conversation_id from public.tw_messages m where m.id = new.message_id and m.deleted_at is null;
  if new.conversation_id is null then raise exception 'الرسالة غير موجودة'; end if;
  if new.participant_id is null then new.actor := 'teacher'; end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists tw_reactions_bi on public.tw_reactions;
create trigger tw_reactions_bi before insert on public.tw_reactions
  for each row execute function public.tw_reactions_before();

-- أي تصويت أو تفاعل يحدّث وقت الرسالة فيصل التحديث لحظيًا للجميع
create or replace function public.tw_bump_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.tw_messages set updated_at = now() where id = coalesce(new.message_id, old.message_id);
  return null;
end $$;
drop trigger if exists tw_votes_bump on public.tw_votes;
create trigger tw_votes_bump after insert or update or delete on public.tw_votes
  for each row execute function public.tw_bump_message();
drop trigger if exists tw_reactions_bump on public.tw_reactions;
create trigger tw_reactions_bump after insert or delete on public.tw_reactions
  for each row execute function public.tw_bump_message();

drop trigger if exists tw_templates_touch on public.tw_templates;
create trigger tw_templates_touch before update on public.tw_templates
  for each row execute function public.tw_touch();

-- ---------- 4) صلاحيات أعمدة المعلم ----------
grant insert (conversation_id, sender_role, body, image_path, reply_to, is_announcement, is_pinned, kind, poll_options, audio_path, audio_secs)
  on public.tw_messages to authenticated;
grant insert (title, description, grade, access_mode, expires_at, is_closed, hide_answers, template_id) on public.tw_conversations to authenticated;
grant update (title, description, grade, access_mode, expires_at, is_closed, is_archived, teacher_last_read_at, hide_answers, template_id)
  on public.tw_conversations to authenticated;

drop trigger if exists tw_conversations_au on public.tw_conversations;
create trigger tw_conversations_au
  after update of title, description, grade, access_mode, is_closed, is_archived, expires_at, hide_answers on public.tw_conversations
  for each row execute function public.tw_conversations_after();

-- ---------- 5) الصور والصوت في التخزين ----------
update storage.buckets set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif',
  'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/x-m4a'] where id = 'tw-images';

create or replace function public.tw_storage_can_insert(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-z-]+/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif|webm|ogg|m4a|mp4|mp3|aac)$' and (
    exists (select 1 from public.tw_conversations c join public.tw_participants p on p.conversation_id = c.id
            where c.secret_key::text = split_part(p_name, '/', 1)
              and p.upload_key::text = split_part(p_name, '/', 2)
              and not p.is_blocked and public.tw_status(c) = 'open')
    or exists (select 1 from public.tw_conversations c
            where c.secret_key::text = split_part(p_name, '/', 1)
              and split_part(p_name, '/', 2) = 'teacher' and c.owner_id = auth.uid()))
$$;

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
    if new.audio_path is not null and new.audio_path !~ ('^' || v_secret::text || '/teacher/[0-9a-f-]{36}\.(webm|ogg|m4a|mp4|mp3|aac)$') then
      raise exception 'مسار التسجيل غير صالح';
    end if;
    new.is_pinned := coalesce(new.is_pinned, false);
  else
    new.is_announcement := false;
    if new.kind = 'poll' then new.kind := 'text'; new.poll_options := null; end if;
  end if;
  if new.kind <> 'poll' then new.poll_options := null; end if;
  if new.kind = 'poll' then
    new.poll_options := (select array_agg(left(btrim(o), 120)) from unnest(new.poll_options) o where btrim(o) <> '');
  end if;
  if new.audio_path is not null then new.kind := 'voice'; end if;
  new.created_at := now();
  new.updated_at := now();
  new.deleted_at := null;
  return new;
end $$;

-- ---------- 6) تمثيل الرسالة للطالب ----------
drop function if exists public.tw_message_json(public.tw_messages, uuid);
create or replace function public.tw_message_json(m public.tw_messages, p_viewer uuid, p_hide boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when m.deleted_at is not null then
    jsonb_build_object('id', m.id, 'deleted', true, 'deleted_by', m.deleted_by, 'role', m.sender_role,
      'name', m.sender_name, 'created_at', m.created_at, 'updated_at', m.updated_at, 'mine', m.participant_id = p_viewer)
  else jsonb_build_object(
    'id', m.id, 'role', m.sender_role, 'participant_id', m.participant_id, 'name', m.sender_name,
    'body', m.body, 'image_path', m.image_path, 'reply_to', m.reply_to,
    'kind', m.kind, 'audio_path', m.audio_path, 'audio_secs', m.audio_secs,
    'reply', (select jsonb_build_object('id', r.id, 'name', r.sender_name,
                'body', case when r.deleted_at is not null then null
                             when p_hide and r.sender_role = 'student' and r.participant_id is distinct from p_viewer then 'إجابة مخفية حتى يكشفها المعلم'
                             else left(r.body, 140) end,
                'has_image', r.image_path is not null and r.deleted_at is null
                  and not (p_hide and r.sender_role = 'student' and r.participant_id is distinct from p_viewer))
              from public.tw_messages r where r.id = m.reply_to),
    'is_announcement', m.is_announcement, 'is_pinned', m.is_pinned, 'is_featured', m.is_featured,
    'reactions', coalesce((select jsonb_object_agg(x.emoji, x.n) from (
        select emoji, count(*) n from public.tw_reactions where message_id = m.id group by emoji) x), '{}'::jsonb),
    'my_reactions', coalesce((select jsonb_agg(emoji) from public.tw_reactions where message_id = m.id and actor = p_viewer::text), '[]'::jsonb),
    'teacher_reactions', coalesce((select jsonb_agg(emoji) from public.tw_reactions where message_id = m.id and actor = 'teacher'), '[]'::jsonb),
    'poll', case when m.kind = 'poll' then jsonb_build_object(
        'options', to_jsonb(m.poll_options),
        'my_vote', (select v.option from public.tw_votes v where v.message_id = m.id and v.participant_id = p_viewer),
        'total', (select count(*) from public.tw_votes v where v.message_id = m.id),
        'counts', case when exists (select 1 from public.tw_votes v where v.message_id = m.id and v.participant_id = p_viewer)
          then (select jsonb_agg((select count(*) from public.tw_votes v where v.message_id = m.id and v.option = i - 1) order by i)
                from generate_subscripts(m.poll_options, 1) i)
          else null end)
      end,
    'deleted', false, 'created_at', m.created_at, 'updated_at', m.updated_at,
    'mine', m.participant_id is not null and m.participant_id = p_viewer)
  end
$$;

create or replace function public.tw_conv_json(c public.tw_conversations)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'grade', c.grade,
    'access_mode', c.access_mode, 'status', public.tw_status(c), 'expires_at', c.expires_at,
    'hide_answers', c.hide_answers,
    'teacher_name', coalesce((select t.display_name from public.tw_teachers t where t.id = c.owner_id), 'المعلم'),
    'participant_count', (select count(*) from public.tw_participants p where p.conversation_id = c.id and not p.is_blocked),
    'created_at', c.created_at)
$$;

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
      select jsonb_agg(public.tw_message_json(m, (a.p).id, (a.c).hide_answers) order by m.created_at)
      from (select * from public.tw_messages mm
            where mm.conversation_id = (a.c).id
              and (p_since is null or mm.updated_at > p_since)
              and (not (a.c).hide_answers or mm.sender_role = 'teacher' or mm.participant_id = (a.p).id)
            order by mm.created_at desc limit 1000) m), '[]'::jsonb));
end $$;

drop function if exists public.tw_send(text, text, text, uuid);
create or replace function public.tw_send(p_token text, p_body text, p_image_path text default null, p_reply_to uuid default null,
  p_audio_path text default null, p_audio_secs int default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  a record;
  m public.tw_messages;
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  select * into a from public.tw_auth(p_token);
  if (a.p).is_blocked then raise exception 'تم إيقاف مشاركتك في هذه المحادثة' using errcode = 'P0001'; end if;
  if public.tw_status(a.c) <> 'open' then raise exception 'المحادثة مغلقة، لا يمكن إرسال رسائل جديدة' using errcode = 'P0001'; end if;
  if v_body is null and p_image_path is null and p_audio_path is null then raise exception 'الرسالة فارغة' using errcode = 'P0001'; end if;
  if char_length(coalesce(v_body, '')) > 2000 then raise exception 'الرسالة طويلة جدًا (الحد 2000 حرف)' using errcode = 'P0001'; end if;
  if p_image_path is not null then
    if p_image_path !~ ('^' || (a.c).secret_key::text || '/' || (a.p).upload_key::text || '/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|gif)$') then
      raise exception 'مسار الصورة غير صالح' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'tw-images' and o.name = p_image_path) then
      raise exception 'لم يكتمل رفع الصورة' using errcode = 'P0001';
    end if;
  end if;
  if p_audio_path is not null then
    if p_audio_path !~ ('^' || (a.c).secret_key::text || '/' || (a.p).upload_key::text || '/[0-9a-f-]{36}\.(webm|ogg|m4a|mp4|mp3|aac)$') then
      raise exception 'مسار التسجيل غير صالح' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'tw-images' and o.name = p_audio_path) then
      raise exception 'لم يكتمل رفع التسجيل' using errcode = 'P0001';
    end if;
  end if;
  if p_reply_to is not null and not exists (select 1 from public.tw_messages r where r.id = p_reply_to and r.conversation_id = (a.c).id) then
    p_reply_to := null;
  end if;
  if (select count(*) from public.tw_messages x where x.participant_id = (a.p).id and x.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'أرسلت رسائل كثيرة بسرعة، انتظر دقيقة' using errcode = 'P0001';
  end if;
  insert into public.tw_messages(conversation_id, participant_id, sender_role, sender_name, body, image_path, reply_to, audio_path, audio_secs, kind)
    values ((a.c).id, (a.p).id, 'student', (a.p).name, v_body, p_image_path, p_reply_to, p_audio_path,
            least(greatest(coalesce(p_audio_secs, 0), 0), 180), case when p_audio_path is not null then 'voice' else 'text' end)
    returning * into m;
  update public.tw_participants set last_seen_at = now() where id = (a.p).id;
  return public.tw_message_json(m, (a.p).id, (a.c).hide_answers);
end $$;

-- ---------- 7) التصويت والتفاعل للطلاب ----------
create or replace function public.tw_vote(p_token text, p_message_id uuid, p_option int)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a record; m public.tw_messages;
begin
  select * into a from public.tw_auth(p_token);
  if (a.p).is_blocked then raise exception 'تم إيقاف مشاركتك في هذه المحادثة' using errcode = 'P0001'; end if;
  if public.tw_status(a.c) <> 'open' then raise exception 'المحادثة مغلقة، لا يمكن التصويت' using errcode = 'P0001'; end if;
  select * into m from public.tw_messages where id = p_message_id and conversation_id = (a.c).id and kind = 'poll' and deleted_at is null;
  if not found then raise exception 'السؤال غير موجود' using errcode = 'P0001'; end if;
  if p_option < 0 or p_option >= cardinality(m.poll_options) then raise exception 'اختيار غير صالح' using errcode = 'P0001'; end if;
  insert into public.tw_votes(message_id, participant_id, conversation_id, option)
    values (m.id, (a.p).id, (a.c).id, p_option)
    on conflict (message_id, participant_id) do update set option = excluded.option, created_at = now();
  select * into m from public.tw_messages where id = p_message_id;
  return public.tw_message_json(m, (a.p).id, (a.c).hide_answers);
end $$;

create or replace function public.tw_react(p_token text, p_message_id uuid, p_emoji text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare a record; m public.tw_messages;
begin
  select * into a from public.tw_auth(p_token);
  if (a.p).is_blocked then raise exception 'تم إيقاف مشاركتك في هذه المحادثة' using errcode = 'P0001'; end if;
  select * into m from public.tw_messages where id = p_message_id and conversation_id = (a.c).id and deleted_at is null;
  if not found then raise exception 'الرسالة غير موجودة' using errcode = 'P0001'; end if;
  if (a.c).hide_answers and m.sender_role = 'student' and m.participant_id <> (a.p).id then
    raise exception 'الرسالة غير موجودة' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tw_reactions where message_id = m.id and actor = (a.p).id::text and emoji = p_emoji) then
    delete from public.tw_reactions where message_id = m.id and actor = (a.p).id::text and emoji = p_emoji;
  else
    if (select count(*) from public.tw_reactions r where r.actor = (a.p).id::text and r.created_at > now() - interval '1 minute') >= 40 then
      raise exception 'تفاعلات كثيرة بسرعة، انتظر قليلًا' using errcode = 'P0001';
    end if;
    insert into public.tw_reactions(message_id, conversation_id, participant_id, actor, emoji)
      values (m.id, (a.c).id, (a.p).id, (a.p).id::text, p_emoji);
  end if;
  select * into m from public.tw_messages where id = p_message_id;
  return public.tw_message_json(m, (a.p).id, (a.c).hide_answers);
end $$;

-- ---------- 8) النقاط ولوحة الشرف ----------
-- النقاط: رسالة = 1 (حتى 20 في الدرس)، تصويت = 1، إجابة مميزة = 5، نجمة ⭐ من المعلم = 2، 👏 من المعلم = 1
create or replace function public.tw_board_for(p_conv uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(row_to_json(x) order by x.points desc, x.name), '[]'::jsonb) from (
    select p.id as participant_id, p.name,
      (select count(*) from public.tw_messages m where m.participant_id = p.id and m.deleted_at is null) as messages,
      (select count(*) from public.tw_messages m where m.participant_id = p.id and m.deleted_at is null and m.is_featured) as featured,
      (select count(*) from public.tw_reactions r join public.tw_messages m on m.id = r.message_id
         where m.participant_id = p.id and m.deleted_at is null and r.actor = 'teacher' and r.emoji = '⭐') as stars,
      (select count(*) from public.tw_votes v where v.participant_id = p.id) as votes,
      least((select count(*) from public.tw_messages m where m.participant_id = p.id and m.deleted_at is null), 20)
      + (select count(*) from public.tw_votes v where v.participant_id = p.id)
      + 5 * (select count(*) from public.tw_messages m where m.participant_id = p.id and m.deleted_at is null and m.is_featured)
      + (select coalesce(sum(case r.emoji when '⭐' then 2 when '👏' then 1 else 0 end), 0) from public.tw_reactions r
           join public.tw_messages m on m.id = r.message_id where m.participant_id = p.id and m.deleted_at is null and r.actor = 'teacher')
        as points
    from public.tw_participants p
    where p.conversation_id = p_conv and not p.is_blocked) x
$$;

create or replace function public.tw_board(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a record;
begin
  select * into a from public.tw_auth(p_token);
  return (select coalesce(jsonb_agg(e - 'messages' - 'votes'), '[]'::jsonb)
          from (select e from jsonb_array_elements(public.tw_board_for((a.c).id)) e limit 10) t);
end $$;

create or replace function public.tw_board_teacher(p_conv uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tw_is_owner(p_conv) then raise exception 'غير مصرح'; end if;
  return public.tw_board_for(p_conv);
end $$;

-- ---------- 9) الصلاحيات على الدوال ----------
revoke execute on function public.tw_teachers_single(), public.tw_reactions_before(), public.tw_bump_message(),
  public.tw_board_for(uuid), public.tw_message_json(public.tw_messages, uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.tw_is_teacher(), public.tw_board_teacher(uuid) from public, anon;
grant execute on function public.tw_is_teacher(), public.tw_board_teacher(uuid) to authenticated;
revoke execute on function public.tw_send(text, text, text, uuid, text, int), public.tw_vote(text, uuid, int),
  public.tw_react(text, uuid, text), public.tw_board(text) from public;
grant execute on function public.tw_send(text, text, text, uuid, text, int), public.tw_vote(text, uuid, int),
  public.tw_react(text, uuid, text), public.tw_board(text) to anon, authenticated;

-- ---------- 10) روابط أقصر للمحادثات الجديدة (6 رموز) ----------
create or replace function public.tw_gen_slug()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  b bytea := extensions.gen_random_bytes(6);
  s text := '';
  i int;
begin
  for i in 0..5 loop
    s := s || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return s;
end $$;
