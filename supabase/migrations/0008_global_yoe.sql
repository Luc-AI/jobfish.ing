-- Add years_experience to profiles
ALTER TABLE public.profiles
  ADD COLUMN years_experience smallint NOT NULL DEFAULT 0
    CHECK (years_experience BETWEEN 0 AND 10);

-- Strip yoe from every object in target_roles JSONB array
UPDATE public.preferences
SET target_roles = (
  SELECT jsonb_agg(obj - 'yoe')
  FROM jsonb_array_elements(target_roles) AS obj
)
WHERE target_roles IS NOT NULL
  AND target_roles != '[]'::jsonb;
