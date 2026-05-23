-- supabase/migrations/0012_job_categories.sql
-- nullable: null = not yet categorized (existing jobs)
-- new jobs always receive categories before evaluation via categorize-jobs task
alter table jobs add column categories text[];
