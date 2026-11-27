export const SALES_SHEET_HEADERS = Object.freeze([
  'sale_id',
  'invoice_number',
  'partner_id',
  'partner_code',
  'partner_name',
  'invoice_date',
  'product_description',
  'panel_quantity',
  'currency',
  'subtotal_ex_vat',
  'vat_amount',
  'total_inc_vat'
]);

const cell = value => value == null ? '' : String(value);

export function mapSalesToSheetRows(sales = [], partners = []) {
  const partnerById = new Map(partners.map(partner => [String(partner.id), partner]));
  const seen = new Set();
  const duplicateIds = [];
  const rows = [];

  for (const sale of sales) {
    const id = cell(sale?.id).trim();
    if (!id) throw new Error('Every sale row must have a stable database ID.');
    if (seen.has(id)) {
      duplicateIds.push(id);
      continue;
    }
    seen.add(id);
    const partner = partnerById.get(cell(sale.partner_id)) || {};
    rows.push([
      id,
      cell(sale.invoice_number),
      cell(sale.partner_id),
      cell(partner.partner_code),
      cell(partner.full_name),
      cell(sale.invoice_date),
      cell(sale.product_description),
      cell(sale.panel_quantity ?? sale.quantity),
      cell(sale.invoice_currency),
      cell(sale.subtotal_ex_vat),
      cell(sale.vat_amount),
      cell(sale.total_inc_vat ?? sale.invoice_amount)
    ]);
  }

  return { rows, duplicateIds };
}

export function planSalesSheetSync(existingValues = [], incomingRows = []) {
  const existingById = new Map();
  const duplicateExistingIds = [];
  const updateRows = [];
  const appendRows = [];
  const duplicateIncomingIds = [];
  const incomingSeen = new Set();

  for (let index = 1; index < existingValues.length; index++) {
    const id = cell(existingValues[index]?.[0]).trim();
    if (!id) continue;
    if (existingById.has(id)) duplicateExistingIds.push(id);
    else existingById.set(id, { rowNumber: index + 1, values: existingValues[index] });
  }

  for (const row of incomingRows) {
    const id = cell(row?.[0]).trim();
    if (!id) throw new Error('Every mapped row must include a stable sale ID in column A.');
    if (incomingSeen.has(id)) {
      duplicateIncomingIds.push(id);
      continue;
    }
    incomingSeen.add(id);

    const existing = existingById.get(id);
    if (!existing) {
      appendRows.push(row);
      continue;
    }
    const differs = SALES_SHEET_HEADERS.some((_, column) => cell(existing.values?.[column]) !== cell(row[column]));
    if (differs) updateRows.push({ rowNumber: existing.rowNumber, values: row });
  }

  return { updateRows, appendRows, duplicateExistingIds, duplicateIncomingIds };
}
