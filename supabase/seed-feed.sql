with seed_rows as (
  select
    series as index,
    ('seed-user-' || lpad(((series - 1) % 240 + 1)::text, 3, '0')) as user_id,
    case
      when series % 7 = 0 then null
      when series % 6 = 0 then 'hopeful'
      when series % 6 = 1 then 'sad'
      when series % 6 = 2 then 'angry'
      when series % 6 = 3 then 'regret'
      when series % 6 = 4 then 'happy'
      else 'anxious'
    end as mood,
    case
      when series % 3 = 0 then concat(
        'I am writing this because I needed one honest place to admit that I am still carrying more doubt than I show, ',
        'but today I am choosing to stay present, keep moving, and trust that a quieter reset can still become something solid. ',
        'This is seeded confession ',
        series,
        ' for the long-read lane.'
      )
      when series % 3 = 1 then concat(
        'Some days I hold it together in public and unravel later. Seeded confession ',
        series,
        '.'
      )
      else concat(
        'I keep acting calm, but I am still figuring out how to let myself change without feeling guilty, and writing it here makes that easier. Seeded confession ',
        series,
        '.'
      )
    end as text,
    timezone('utc', now()) - make_interval(mins => series) as created_at
  from generate_series(1, 1000) as series
)
insert into public.confessions (user_id, text, mood, is_private, created_at)
select
  user_id,
  text,
  mood,
  false,
  created_at
from seed_rows;
