const REQUIRED_FIELDS = Object.freeze(['clientId','clientSecret','refreshToken','organizationId','oauthGrantConfirmed','direction']);
const VALID_DIRECTIONS = Object.freeze(['import_invoices_from_zoho','export_invoices_to_zoho']);
export function assessZohoBooksReadiness(config = {}) {
  const missing = [];
  for (const field of ['clientId','clientSecret','refreshToken','organizationId']) {
    if (!String(config[field] ?? '').trim()) missing.push(field);
  }
  if (config.oauthGrantConfirmed !== true) missing.push('oauthGrantConfirmed');
  if (!VALID_DIRECTIONS.includes(config.direction)) missing.push('direction');
  return {
    ready: missing.length === 0,
    missing,
    direction: VALID_DIRECTIONS.includes(config.direction) ? config.direction : null,
    networkEnabled: false,
    writesEnabled: false,
    requiredFields: REQUIRED_FIELDS.slice()
  };
}
