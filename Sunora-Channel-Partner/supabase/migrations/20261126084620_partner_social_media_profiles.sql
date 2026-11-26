-- Partner social profile fields (stored as a platform-keyed JSON object).
ALTER TABLE public.partners
  ADD COLUMN social_media_profiles jsonb NOT NULL DEFAULT '{}'::jsonb;
