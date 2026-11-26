const payoutCurrency = value => value || 'AED';
const amount = value => Number(value || 0);

export function getPayableProfits(commissions = []) {
  return commissions.filter(c =>
    c.approval_status === 'approved' &&
    c.eligibility_status === 'eligible' &&
    amount(c.commission_amount) > 0 &&
    c.commission_rate != null &&
    c.rate_status !== 'awaiting_manual_rate'
  );
}

export function getAvailableProfits(payableProfits = [], payouts = []) {
  const payoutCommissionIds = new Set(
    payouts.map(p => p.commission_id).filter(Boolean)
  );
  return payableProfits.filter(c => !payoutCommissionIds.has(c.id));
}

export function getPayoutSummaryByCurrency(
  payableProfits = [],
  payouts = [],
  availableProfits = getAvailableProfits(payableProfits, payouts)
) {
  const currencies = [...new Set(payableProfits.map(c => payoutCurrency(c.commission_currency)))];

  return currencies.map(currency => {
    const eligible = payableProfits
      .filter(c => payoutCurrency(c.commission_currency) === currency)
      .reduce((sum, c) => sum + amount(c.commission_amount), 0);

    const pending = payouts
      .filter(p => payoutCurrency(p.currency) === currency && p.status === 'pending')
      .reduce((sum, p) => sum + amount(p.amount), 0);

    const paid = payouts
      .filter(p => payoutCurrency(p.currency) === currency && p.status === 'paid')
      .reduce((sum, p) => sum + amount(p.amount), 0);

    const available = availableProfits
      .filter(c => payoutCurrency(c.commission_currency) === currency)
      .reduce((sum, c) => sum + amount(c.commission_amount), 0);

    return { currency, eligible, pending, paid, available };
  });
}
