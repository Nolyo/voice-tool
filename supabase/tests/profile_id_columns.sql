begin;
select plan(7);

select has_column('public', 'user_settings', 'profile_id', 'user_settings.profile_id existe');
select has_column('public', 'user_dictionary_words', 'profile_id', 'user_dictionary_words.profile_id existe');
select has_column('public', 'user_snippets', 'profile_id', 'user_snippets.profile_id existe');
select has_column('public', 'user_notes', 'profile_id', 'user_notes.profile_id existe');
select has_column('public', 'user_folders', 'profile_id', 'user_folders.profile_id existe');

select col_is_pk('public', 'user_settings', ARRAY['user_id', 'profile_id'],
  'user_settings PK = (user_id, profile_id)');
select col_is_pk('public', 'user_dictionary_words', ARRAY['user_id', 'profile_id', 'word'],
  'user_dictionary_words PK = (user_id, profile_id, word)');

select * from finish();
rollback;
