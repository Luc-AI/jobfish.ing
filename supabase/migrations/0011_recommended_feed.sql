-- supabase/migrations/0011_recommended_feed.sql

-- Returns a JSON array of feed items ordered by score × exp(−λ × age_days).
-- Filters to jobs posted within the last 30 days and excludes hidden jobs.
-- Used for sort modes: fresh (λ=0.15), best (λ=0.02), balanced (λ=0.05).
create or replace function get_job_feed_ranked(
  p_user_id uuid,
  p_lambda  float8,
  p_offset  int default 0,
  p_limit   int default 20
) returns json
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      je.id,
      je.job_id,
      je.score,
      je.reasoning,
      je.dimensions,
      je.notified_at,
      je.created_at,
      json_build_object(
        'id',          j.id,
        'title',       j.title,
        'company',     j.company,
        'location',    j.location,
        'url',         j.url,
        'source',      j.source,
        'remote_type', j.remote_type,
        'industry',    j.industry,
        'synced_at',   j.synced_at
      ) as jobs,
      (
        select json_build_object(
          'job_id',     uja.job_id,
          'status',     uja.status,
          'applied_at', uja.applied_at
        )
        from user_job_actions uja
        where uja.user_id = p_user_id
          and uja.job_id  = je.job_id
        limit 1
      ) as user_job_actions,
      je.score * exp(
        -p_lambda * greatest(
          0,
          extract(epoch from (now() - (j.date_posted)::timestamptz)) / 86400.0
        )
      ) as ranking_score
    from job_evaluations je
    join jobs j on j.id = je.job_id
    where je.user_id    = p_user_id
      and j.is_active   = true
      and j.date_posted >= current_date - 30
      and not exists (
        select 1
        from   user_job_actions uja2
        where  uja2.user_id = p_user_id
          and  uja2.job_id  = je.job_id
          and  uja2.status  = 'hidden'
      )
    order by ranking_score desc
    offset p_offset
    limit  p_limit
  )
  select coalesce(json_agg(ranked), '[]'::json) from ranked
$$;
