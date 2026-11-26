-- Harden the recursive partner branch RPC against staff/admin calls.
-- The public RPC returns no rows unless the caller is an authenticated partner.
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
      AND public.current_user_role() = 'partner'

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
