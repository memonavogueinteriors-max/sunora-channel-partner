export const SALES_SHEET_HEADERS = Object.freeze([
  'sale_id','invoice_number','partner_id','partner_code','partner_name','invoice_date',
  'product_description','panel_quantity','currency','subtotal_ex_vat','vat_amount','total_inc_vat'
]);
const cell = value => value == null ? '' : String(value);
export function mapSalesToSheetRows(sales = [], partners = []) {
  const partnerById = new Map(partners.map(partner => [String(partner.id).trim(), partner]));
  const seen = new Set(), duplicateIds = [], rows = [];
  for (const sale of sales) {
    const id = cell(sale?.id).trim();
    if (!id) throw new Error('Every sale row must have a stable database ID.');
    if (seen.has(id)) { duplicateIds.push(id); continue; }
    seen.add(id);
    const partnerId = cell(sale?.partner_id).trim();
    const partner = partnerById.get(partnerId);
    if (!partnerId || !partner) throw new Error('Every sale must reference a known partner before sync.');
    rows.push([
      id, cell(sale.invoice_number), partnerId, cell(partner.partner_code),
      cell(partner.full_name), cell(sale.invoice_date), cell(sale.product_description),
      cell(sale.panel_quantity ?? sale.quantity), cell(sale.invoice_currency),
      cell(sale.subtotal_ex_vat), cell(sale.vat_amount),
      cell(sale.total_inc_vat ?? sale.invoice_amount)
    ]);
  }
  return { rows, duplicateIds };
}
export function planSalesSheetSync(existingValues = [], incomingRows = []) {
  const existingById = new Map(), duplicateExistingIds = [], updateRows = [], appendRows = [], duplicateIncomingIds = [], incomingSeen = new Set();
  for (let index = 1; index < existingValues.length; index++) {
    const id = cell(existingValues[index]?.[0]).trim();
    if (!id) continue;
    if (existingById.has(id)) duplicateExistingIds.push(id);
    else existingById.set(id, { rowNumber: index + 1, values: existingValues[index] });
  }
  for (const row of incomingRows) {
    const id = cell(row?.[0]).trim();
    if (!id) throw new Error('Every mapped row must include a stable sale ID in column A.');
    if (incomingSeen.has(id)) { duplicateIncomingIds.push(id); continue; }
    incomingSeen.add(id);
    const existing = existingById.get(id);
    if (!existing) { appendRows.push(row); continue; }
    const differs = SALES_SHEET_HEADERS.some((_, column) => cell(existing.values?.[column]) !== cell(row[column]));
    if (differs) updateRows.push({ rowNumber: existing.rowNumber, values: row });
  }
  return { updateRows, appendRows, duplicateExistingIds, duplicateIncomingIds };
}

export function validateSheetsSyncRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }
  const unexpectedKeys = Object.keys(body).filter(key => key !== 'dry_run');
  if (unexpectedKeys.length) return { valid: false, error: 'Unexpected request fields are not allowed.' };
  if (body.dry_run !== undefined && typeof body.dry_run !== 'boolean') {
    return { valid: false, error: 'dry_run must be true or false.' };
  }
  return { valid: true, dryRun: body.dry_run !== false };
}


// Read-back verification fails closed on header drift, malformed incoming rows, or duplicate IDs.
export function verifySheetSyncRows(values = [], incomingRows = []) {
  if (!Array.isArray(values) || !Array.isArray(incomingRows) || !Array.isArray(values[0])) return false;
  if (JSON.stringify(values[0]) !== JSON.stringify(SALES_SHEET_HEADERS)) return false;
  if (incomingRows.some(row => !Array.isArray(row) || row.length !== SALES_SHEET_HEADERS.length || !cell(row[0]).trim())) return false;
  const rowsById = new Map();
  for (const row of values.slice(1)) {
    const id = cell(row?.[0]).trim();
    if (!id) continue;
    rowsById.set(id, [...(rowsById.get(id) || []), row]);
  }
  for (const expected of incomingRows) {
    const matches = rowsById.get(cell(expected[0]).trim()) || [];
    if (matches.length !== 1) return false;
    if (SALES_SHEET_HEADERS.some((_, column) => cell(matches[0]?.[column]) !== cell(expected[column]))) return false;
  }
  return true;
}
// Supabase REST has a configured maximum row count; fetch in bounded pages to avoid silent truncation.
export async function collectPages(fetchPage, pageSize = 500) {
  if (typeof fetchPage !== 'function') throw new TypeError('fetchPage must be a function.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new RangeError('pageSize must be an integer between 1 and 1000.');
  const allRows = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await fetchPage(offset, offset + pageSize - 1);
    if (result?.error) throw result.error;
    if (!Array.isArray(result?.data)) throw new Error('Paged response must contain a data array.');
    if (result.data.length > pageSize) throw new Error('Paged response exceeded the requested page size.');
    allRows.push(...result.data);
    if (result.data.length < pageSize) return allRows;
  }
}

export function chunkValues(values = [], chunkSize = 100) {
  if (!Array.isArray(values)) throw new TypeError('values must be an array.');
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 1000) throw new RangeError('chunkSize must be an integer between 1 and 1000.');
  const chunks = [];
  for (let offset = 0; offset < values.length; offset += chunkSize) chunks.push(values.slice(offset, offset + chunkSize));
  return chunks;
}


export function buildSafeSheetsSyncFailure(requestId) {
  const reference = typeof requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId) ? requestId : 'unavailable';
  return { error: 'Sheets sync failed. Internal details are withheld; check server logs using this reference.', request_id: reference };
}
