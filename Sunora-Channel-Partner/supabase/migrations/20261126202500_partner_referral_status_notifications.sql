-- Notify linked partners when a referral pipeline status changes.
-- This is an in-app notification only; no email or external messaging is sent.
CREATE OR REPLACE FUNCTION public.sunora_partner_referral_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid;
  v_title text;
  v_message text;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT p.user_id
      INTO v_user_id
      FROM public.partners p
      WHERE p.id = NEW.partner_id;

    IF v_user_id IS NOT NULL THEN
      v_title := CASE
        WHEN NEW.status = 'Converted' THEN 'Referral Converted'
        WHEN NEW.status = 'Lost' THEN 'Referral Closed'
        ELSE 'Referral Status Updated'
      END;

      v_message := CASE
        WHEN NEW.status = 'Converted' THEN 'Your referral for ' || coalesce(NEW.contact_name, 'a contact') || ' has converted into a sale.'
        WHEN NEW.status = 'Lost' THEN 'Your referral for ' || coalesce(NEW.contact_name, 'a contact') || ' was marked Lost.'
        ELSE 'Your referral for ' || coalesce(NEW.contact_name, 'a contact') || ' changed from ' || OLD.status || ' to ' || NEW.status || '.'
      END;

      INSERT INTO public.notifications (
        user_id, event_type, title, message, related_table, related_id, metadata
      )
      VALUES (
        v_user_id,
        'referral_status_changed',
        v_title,
        v_message,
        'referrals',
        NEW.id,
        jsonb_build_object(
          'contact_name', NEW.contact_name,
          'company', NEW.company,
          'previous_status', OLD.status,
          'new_status', NEW.status
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sunora_partner_referral_status_notification()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sunora_referral_status_notification_trigger ON public.referrals;
CREATE TRIGGER sunora_referral_status_notification_trigger
AFTER UPDATE OF status ON public.referrals
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sunora_partner_referral_status_notification();
