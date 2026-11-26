-- Category 5 security hardening: remove anonymous access and non-RLS privileges.
-- RLS governs row-level CRUD for authenticated users; TRUNCATE is not RLS-filtered.
REVOKE ALL ON TABLE public.referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.referrals TO authenticated;
GRANT ALL ON TABLE public.referrals TO service_role;
