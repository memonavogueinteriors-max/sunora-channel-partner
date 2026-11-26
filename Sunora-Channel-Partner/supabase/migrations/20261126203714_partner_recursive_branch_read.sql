-- Return only the fields needed to render a partner's recursive referral branch.
-- SECURITY DEFINER bypasses the direct-child partners RLS policy without broadening table access.
CREATE OR REPLACE FUNCTION public.sunora_get_partner_branch()
RETURNS TABLE (
  id uuid,
  partner_code text,
  full_name text,
  parent_partner_id uuid,
  partner_type text,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH RECURSIVE branch AS (
    SELECT p.id, p.partner_code, p.full_name, p.parent_partner_id, p.partner_type, p.status
    FROM public.partners p
    WHERE p.id = public.current_partner_id()

    UNION

    SELECT child.id, child.partner_code, child.full_name, child.parent_partner_id, child.partner_type, child.status
    FROM public.partners child
    JOIN branch parent ON child.parent_partner_id = parent.id
  )
  SELECT branch.id, branch.partner_code, branch.full_name, branch.parent_partner_id, branch.partner_type, branch.status
  FROM branch;
$$;

REVOKE ALL ON FUNCTION public.sunora_get_partner_branch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sunora_get_partner_branch() TO authenticated;
