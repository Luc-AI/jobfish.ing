-- supabase/migrations/0006_role_picker.sql

ALTER TABLE public.preferences
  ALTER COLUMN target_roles
  TYPE jsonb
  USING (
    CASE
      WHEN target_roles IS NULL OR array_length(target_roles, 1) IS NULL
      THEN '[]'::jsonb
      ELSE (
        SELECT jsonb_agg(
          jsonb_build_object('role', r, 'minYoe', 0, 'maxYoe', 0)
        )
        FROM unnest(target_roles) r
      )
    END
  );

ALTER TABLE public.preferences
  ALTER COLUMN target_roles SET DEFAULT '[]'::jsonb;
