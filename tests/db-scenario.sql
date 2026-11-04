-- اختبار سيناريو «التوكل على الله» على قاعدة البيانات الحقيقية.
-- يُنشئ معلمَين وهميين وطالبين، ثم يتراجع عن كل شيء تلقائيًا (الاستثناء في النهاية يلغي المعاملة).
-- النتيجة تظهر في رسالة الخطأ: RESULT {...}. أي قيمة "ALLOWED!" تعني ثغرة.
do $$
declare
  uid uuid := gen_random_uuid(); uid2 uuid := gen_random_uuid();
  conv public.tw_conversations; s1 jsonb; s2 jsonb; o jsonb := '{}'; m jsonb; tm public.tw_messages; f jsonb; n int; p text; p_bad text; d record;
begin
  insert into auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
    values (uid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tw-test-'||uid||'@example.com','{}','{}',now(),now()),
           (uid2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','tw-test-'||uid2||'@example.com','{}','{}',now(),now());
  perform set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  insert into public.tw_teachers(id, display_name) values (uid, 'أ. حسن');
  insert into public.tw_conversations(title, grade) values ('التوكل على الله','الصف الخامس') returning * into conv;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role','anon', true);
  o := o || jsonb_build_object('public', public.tw_conv_public(conv.slug));
  begin perform public.tw_join(conv.slug, '    '); o := o||'{"empty_name":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('empty_name', sqlerrm); end;
  s1 := public.tw_join(conv.slug, '  أحمد  ');
  s2 := public.tw_join(conv.slug, 'محمد');
  begin perform public.tw_join(conv.slug, 'احمد'); o := o||'{"dup_name":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('dup_name', sqlerrm); end;
  begin perform count(*) from public.tw_messages; o := o||'{"anon_select_messages":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('anon_select_messages', sqlerrm); end;
  begin perform count(*) from public.tw_conversations; o := o||'{"anon_select_convs":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('anon_select_convs', sqlerrm); end;
  begin perform public.tw_dashboard(); o := o||'{"anon_dashboard":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('anon_dashboard', sqlerrm); end;
  m := public.tw_send(s1->>'token', 'التوكل هو الاعتماد على الله مع الأخذ بالأسباب', null, null);
  p := (s2->'conversation'->>'secret_key') || '/' || (s2->'participant'->>'upload_key') || '/' || gen_random_uuid() || '.jpg';
  p_bad := (s2->'conversation'->>'secret_key') || '/' || gen_random_uuid() || '/' || gen_random_uuid() || '.jpg';
  begin insert into storage.objects(bucket_id, name) values ('tw-images', p_bad); o := o||'{"upload_bad_key":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('upload_bad_key', sqlerrm); end;
  insert into storage.objects(bucket_id, name) values ('tw-images', p);
  begin perform public.tw_send(s1->>'token', null, p, null); o := o||'{"send_others_image":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('send_others_image', sqlerrm); end;
  m := public.tw_send(s2->>'token', 'صورة من دفتري', p, null);
  perform set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  select count(*) into n from public.tw_messages where conversation_id = conv.id;
  o := o || jsonb_build_object('teacher_sees_msgs', n);
  insert into public.tw_messages(conversation_id, sender_role, body, reply_to) values (conv.id, 'teacher', 'أحسنت', (m->>'id')::uuid) returning * into tm;
  begin update public.tw_messages set body = 'تعديل' where id = (m->>'id')::uuid; o := o||'{"teacher_edit_body":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('teacher_edit_body', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub',uid2,'role','authenticated')::text, true);
  select count(*) into n from public.tw_messages where conversation_id = conv.id;
  o := o || jsonb_build_object('other_teacher_sees', n);
  begin insert into public.tw_messages(conversation_id, sender_role, body) values (conv.id, 'teacher', 'اختراق'); o := o||'{"other_teacher_insert":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('other_teacher_insert', sqlerrm); end;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role','anon', true);
  f := public.tw_feed(s1->>'token', null);
  o := o || jsonb_build_object('ahmad_feed_count', jsonb_array_length(f->'messages'));
  begin perform public.tw_delete_own(s1->>'token', (m->>'id')::uuid); o := o||'{"delete_others":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('delete_others', sqlerrm); end;
  begin perform public.tw_feed('bad-token', null); o := o||'{"bad_token":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('bad_token', sqlerrm); end;
  perform set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);
  update public.tw_conversations set is_closed = true where id = conv.id;
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.tw_send(s1->>'token', 'بعد الإغلاق', null, null); o := o||'{"send_closed":"ALLOWED!"}'; exception when others then o := o||jsonb_build_object('send_closed', sqlerrm); end;
  perform set_config('role','none', true);
  select count(*) into n from realtime.messages where topic = 'tw:' || conv.secret_key::text;
  o := o || jsonb_build_object('realtime_events', n);
  raise exception 'RESULT %', o::text;
end $$;
