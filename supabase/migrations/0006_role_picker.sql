-- supabase/migrations/0006_role_picker.sql

-- Temporary helper to convert text[] → jsonb without a subquery in USING clause
-- (PostgreSQL does not allow subqueries in ALTER COLUMN ... TYPE ... USING)
CREATE OR REPLACE FUNCTION _convert_target_roles(roles text[]) RETURNS jsonb AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('role', r, 'yoe', 0)) FROM unnest(roles) r),
    '[]'::jsonb
  )
$$ LANGUAGE sql;

ALTER TABLE public.preferences
  ALTER COLUMN target_roles DROP DEFAULT;

ALTER TABLE public.preferences
  ALTER COLUMN target_roles
  TYPE jsonb
  USING _convert_target_roles(target_roles);

ALTER TABLE public.preferences
  ALTER COLUMN target_roles SET DEFAULT '[]'::jsonb;

DROP FUNCTION _convert_target_roles;
