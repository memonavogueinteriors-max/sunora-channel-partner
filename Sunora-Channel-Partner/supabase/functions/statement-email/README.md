# Monthly statement email scaffold

The shared template helper in `supabase/functions/_shared/statementEmail.js` creates a SUNORA-branded statement notice with a fixed portal origin, HTML-escaped partner values, subject-line newline sanitization, and a month-specific PDF filename.

It does **not** send email or attach a PDF. No Resend/Mailgun/SMTP credentials are stored, and no email delivery function is deployed. This is a reusable template-only scaffold. The separate partner invitation/welcome email and all Category 2 live verification remain parked.
