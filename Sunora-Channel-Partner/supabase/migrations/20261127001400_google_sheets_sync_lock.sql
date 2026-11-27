-- A short service-role-only lease prevents concurrent Google Sheets upsert runs.
-- It contains no partner or financial data and is never accessible to client roles.
CREATE TABLE IF NOT EXISTS public.sunora_sheets_sync_lock (
  lock_id smallint PRIMARY KEY CHECK (lock_id = 1),
  owner_token uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sunora_sheets_sync_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sunora_sheets_sync_lock FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.sunora_sheets_sync_lock TO service_role;

CREATE OR REPLACE FUNCTION public.sunora_acquire_sheets_sync_lock(
  p_owner_token uuid,
  p_ttl_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_acquired boolean;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.';
  END IF;
  IF p_owner_token IS NULL OR p_ttl_seconds < 60 OR p_ttl_seconds > 300 THEN
    RAISE EXCEPTION 'Invalid lock parameters.';
  END IF;

  INSERT INTO public.sunora_sheets_sync_lock (lock_id, owner_token, expires_at, updated_at)
  VALUES (1, p_owner_token, now() + make_interval(secs => p_ttl_seconds), now())
  ON CONFLICT (lock_id) DO UPDATE
    SET owner_token = EXCLUDED.owner_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    WHERE public.sunora_sheets_sync_lock.expires_at <= now()
  RETURNING true INTO v_acquired;

  RETURN coalesce(v_acquired, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.sunora_release_sheets_sync_lock(p_owner_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_released boolean;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required.';
  END IF;
  IF p_owner_token IS NULL THEN
    RAISE EXCEPTION 'Lock owner token required.';
  END IF;

  DELETE FROM public.sunora_sheets_sync_lock
  WHERE lock_id = 1 AND owner_token = p_owner_token
  RETURNING true INTO v_released;

  RETURN coalesce(v_released, false);
END;
$$;

REVOKE ALL ON FUNCTION public.sunora_acquire_sheets_sync_lock(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sunora_release_sheets_sync_lock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sunora_acquire_sheets_sync_lock(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sunora_release_sheets_sync_lock(uuid) TO service_role;
