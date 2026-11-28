
import React, { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { getPayableProfits, getAvailableProfits, getPayoutSummaryByCurrency } from './payouts';
import {
  Sun, LayoutDashboard, Users, GitBranch, ReceiptText, Wallet,
  CreditCard, FileSpreadsheet, LogOut, Search, Plus, RefreshCw,
  Menu, X, ArrowUpRight, TrendingUp, UserRound, Download,
  ShieldCheck, CircleAlert, CheckCircle2, BadgePercent, Calculator,
  CalendarDays, ChartNoAxesCombined, ClipboardList, Bell
} from 'lucide-react';
import { buildPartnerStatementPdf } from './statementPdf';

const money = (n, currency = 'AED') =>
  new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number(n || 0));

const USD_TO_AED = 3.68;

const toAED = (amount, currency = 'AED', rate = USD_TO_AED) =>
  Number(amount || 0) * (currency === 'USD' ? Number(rate || USD_TO_AED) : 1);

const commissionTier = q =>
  q <= 3 ? { code: '0_percent', rate: 0, label: '0%' } :
  q <= 50 ? { code: '4_to_50', rate: 5, label: '5%' } :
  q <= 100 ? { code: '51_to_100', rate: 10, label: '10%' } :
  q <= 150 ? { code: '101_to_150', rate: 15, label: '15%' } :
  { code: 'manual_over_150', rate: null, label: 'Manual approval required' };

const dateLabel = d =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  }) : '—';

const currentDubaiDate = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const currentMonth = () => currentDubaiDate().slice(0, 7);

const monthLabel = value => {
  if (!value) return '';
  return new Date(`${value}-01T00:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric'
  });
};

const nav = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Channel Partners', icon: Users },
  { name: 'Referral Network', icon: GitBranch },
  { name: 'Sales & Invoices', icon: ReceiptText },
  { name: 'Profit Ledger', icon: BadgePercent },
  { name: 'Savings Ledger', icon: Wallet },
  { name: 'Payments', icon: CreditCard }
];

function downloadCsv(rows, filename) {
  if (!rows.length) return;

  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const csv = [
    headers.map(x => `"${String(x).replaceAll('"', '""')}"`).join(','),
    ...rows.map(row =>
      headers.map(key =>
        `"${String(row[key] ?? '').replaceAll('"', '""')}"`
      ).join(',')
    )
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function inMonth(date, month) {
  return Boolean(date && month && String(date).slice(0, 7) === month);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('Dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [reportMonth, setReportMonth] = useState(currentMonth());

  const [partners, setPartners] = useState([]);
  const [branchPartners, setBranchPartners] = useState([]);
  const [sales, setSales] = useState([]);
  const [payments, setPayments] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [commissionPayouts, setCommissionPayouts] = useState([]);
  const [projectCosts, setProjectCosts] = useState([]);
  const [productPrices, setProductPrices] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [referralForm, setReferralForm] = useState({ contact_name: '', company: '', email: '', phone: '', notes: '' });

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [showPartner, setShowPartner] = useState(false);
  const [showSale, setShowSale] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const [selectedCommission, setSelectedCommission] = useState(null);
  const [commissionDecision, setCommissionDecision] = useState('approved');
  const [approvalComments, setApprovalComments] = useState('');

  const [selectedRateCommission, setSelectedRateCommission] = useState(null);
  const [manualRate, setManualRate] = useState('');

  const [selectedProject, setSelectedProject] = useState(null);
  const [projectReview, setProjectReview] = useState({
    final_client_payment_received: false,
    final_deliverables_submitted: false,
    qc_passed: false,
    client_accepted: false,
    completion_comments: ''
  });
  const [selectedPayout, setSelectedPayout] = useState(null);
  const [payoutPaymentForm, setPayoutPaymentForm] = useState({
    payment_date: currentDubaiDate(),
    payment_reference: '',
    notes: ''
  });

  const [partnerForm, setPartnerForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    partner_type: 'Interior Designer',
    parent_partner_id: '',
    social_media_profiles: {}
  });

  const [saleForm, setSaleForm] = useState({
    partner_id: '',
    referral_id: '',
    invoice_number: '',
    invoice_date: currentDubaiDate(),
    country: 'United Arab Emirates',
    invoice_currency: 'AED',
    panel_size: '60x60',
    product_description: 'Sunora Wellness Panel',
    quantity: '1',
    unit_price: String(900 * USD_TO_AED),
    additional_cost_description: '',
    additional_cost_amount: '0',
    savings_rate: '10',
    notes: ''
  });

  const [paymentForm, setPaymentForm] = useState({
    partner_id: '',
    amount: '',
    payment_date: currentDubaiDate(),
    reference: '',
    notes: ''
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      else setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);

      if (next) {
        loadProfile(next.user.id);
      } else {
        setProfile(null);
        setPartners([]);
        setBranchPartners([]);
        setSales([]);
        setPayments([]);
        setCommissions([]);
        setCommissionPayouts([]);
        setProjectCosts([]);
        setAuditLogs([]);
        setNotifications([]);
        setReferrals([]);
        setTab('Dashboard');
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    setLoading(true);
    setError('');

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) setError(profileError.message);

    setProfile(data || null);
    setLoading(false);

    if (data) await loadData(data.role);
  }

  async function loadData(userRole = profile?.role) {
    if (!supabase) return;

    setBusy(true);
    setError('');

    const requests = [
      supabase.from('partners')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase.from('sales')
        .select('*, partner:partners!sales_partner_id_fkey(id,partner_code,full_name)')
        .order('invoice_date', { ascending: false }),

      supabase.from('payments')
        .select('*, partner:partners!payments_partner_id_fkey(id,partner_code,full_name)')
        .order('payment_date', { ascending: false }),

      supabase.from('sale_commissions')
        .select('*, partner:partners!sale_commissions_partner_id_fkey(id,partner_code,full_name), sale:sales!sale_commissions_sale_id_fkey(id,invoice_number,invoice_date,final_client_payment_received,final_deliverables_submitted,qc_passed,client_accepted,completion_comments,completion_approved_by,completion_approved_at)')
        .order('created_at', { ascending: false }),

      supabase.from('sunora_product_prices')
        .select('*')
        .eq('is_active', true)
        .order('panel_size'),

      supabase.from('commission_payouts')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase.from('sale_project_costs')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase.from('referrals')
        .select('*, partner:partners!referrals_partner_id_fkey(id,partner_code,full_name)')
        .order('created_at', { ascending: false })
    ];

    if (userRole === 'admin') {
      requests.push(
        supabase.from('sunora_audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)
      );
    }

    requests.push(
      supabase.from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
    );

    if (userRole === 'partner') {
      requests.push(supabase.rpc('sunora_get_partner_branch'));
    }

    const results = await Promise.all(requests);
    const firstError = results.find(r => r.error)?.error;

    if (firstError) setError(firstError.message);

    const partnerRows = results[0].data || [];

    setPartners(
      partnerRows.map(p => ({
        ...p,
        parent: partnerRows.find(x => x.id === p.parent_partner_id) || null
      }))
    );

    setSales(results[1].data || []);
    setPayments(results[2].data || []);
    setCommissions(results[3].data || []);
    setProductPrices(results[4].data || []);
    setCommissionPayouts(results[5].data || []);
    setProjectCosts(results[6].data || []);
    setReferrals(results[7].data || []);
    setAuditLogs(userRole === 'admin' ? (results[8]?.data || []) : []);
    setNotifications(userRole === 'admin' ? (results[9]?.data || []) : (results[8]?.data || []));
    setBranchPartners(userRole === 'partner' ? (results[9]?.data || []) : []);

    setBusy(false);
  }

  async function signIn(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword
    });

    if (signInError) setError(signInError.message);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTab('Dashboard');
  }

  function flash(message) {
    setNotice(message);
    setTimeout(() => setNotice(''), 4500);
  }

  const isStaff = profile?.role === 'admin' || profile?.role === 'staff';
  const isAdmin = profile?.role === 'admin';
  const isPartner = profile?.role === 'partner';

  const visiblePartners = useMemo(
    () => partners.filter(p =>
      [p.full_name, p.partner_code, p.email, p.phone]
        .some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))
    ),
    [partners, search]
  );

  const ownPartner = partners.find(p => p.user_id === session?.user?.id);
  const scopedReferrals = isStaff ? referrals : referrals.filter(r => r.partner_id === ownPartner?.id);

  const scopedSales = isStaff
    ? sales
    : sales.filter(s => s.partner_id === ownPartner?.id);

  const scopedPartners = isStaff
    ? partners
    : partners.filter(p =>
        p.id === ownPartner?.id || p.parent_partner_id === ownPartner?.id
      );

  const branchNetworkRows = isStaff ? partners : (branchPartners.length ? branchPartners : scopedPartners);
  const branchPartnerCount = isStaff ? partners.length : branchNetworkRows.filter(p => p.id !== ownPartner?.id).length;
  const branchNetworkRoots = isStaff
    ? branchNetworkRows.filter(p => !p.parent_partner_id || !branchNetworkRows.some(x => x.id === p.parent_partner_id))
    : branchNetworkRows.filter(p => p.id === ownPartner?.id);

  const scopedPayments = isStaff
    ? payments
    : payments.filter(p => p.partner_id === ownPartner?.id);

  const scopedCommissions = isStaff
    ? commissions
    : commissions.filter(c => c.partner_id === ownPartner?.id);

  const ownCommissionIds = new Set(scopedCommissions.map(c => c.id));

  const scopedPayouts = isStaff
    ? commissionPayouts
    : commissionPayouts.filter(p => ownCommissionIds.has(p.commission_id));

  const payableProfits = getPayableProfits(scopedCommissions);
  const availableProfits = getAvailableProfits(payableProfits, scopedPayouts);
  const payoutSummaryByCurrency = getPayoutSummaryByCurrency(
    payableProfits,
    scopedPayouts,
    availableProfits
  );

  const totalSales = sales.reduce(
    (sum, x) => sum + toAED(
      x.total_inc_vat ?? x.invoice_amount,
      x.invoice_currency || 'AED',
      x.exchange_rate_to_aed
    ),
    0
  );

  const totalSavings = sales.reduce(
    (sum, x) => sum + toAED(
      x.savings_amount,
      x.invoice_currency || 'AED',
      x.exchange_rate_to_aed
    ),
    0
  );

  const totalPaid = payments.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const totalDue = Math.max(0, totalSavings - totalPaid);

  const effectiveSales = scopedSales.reduce(
    (sum, x) => sum + toAED(
      x.total_inc_vat ?? x.invoice_amount,
      x.invoice_currency || 'AED',
      x.exchange_rate_to_aed
    ),
    0
  );

  const effectiveSavings = scopedSales.reduce(
    (sum, x) => sum + toAED(
      x.savings_amount,
      x.invoice_currency || 'AED',
      x.exchange_rate_to_aed
    ),
    0
  );

  const effectivePaid = scopedPayments.reduce(
    (sum, x) => sum + Number(x.amount || 0),
    0
  );

  // ---------------------------------------------------------
  // MONTHLY REPORT DATA — ADMIN ONLY
  // ---------------------------------------------------------

  const reportSales = isAdmin
    ? sales.filter(s => inMonth(s.invoice_date, reportMonth))
    : [];

  const reportCommissions = isAdmin
    ? commissions.filter(c => inMonth(c.sale?.invoice_date, reportMonth))
    : [];

  const reportPayouts = isAdmin
    ? commissionPayouts.filter(p => inMonth(
        p.payment_date || p.paid_at || p.created_at,
        reportMonth
      ))
    : [];

  const reportCosts = isAdmin
    ? projectCosts.filter(c => {
        const sale = sales.find(s => s.id === c.sale_id);
        return sale && inMonth(sale.invoice_date, reportMonth);
      })
    : [];

  const salesByCurrency = useMemo(() => {
    const grouped = {};

    reportSales.forEach(s => {
      const currency = s.invoice_currency || 'AED';

      if (!grouped[currency]) {
        grouped[currency] = {
          currency,
          invoiceCount: 0,
          panels: 0,
          subtotal: 0,
          vat: 0,
          total: 0,
          totalAED: 0
        };
      }

      grouped[currency].invoiceCount += 1;
      grouped[currency].panels += Number(s.panel_quantity ?? s.quantity ?? 0);
      grouped[currency].subtotal += Number(s.subtotal_ex_vat || 0);
      grouped[currency].vat += Number(s.vat_amount || 0);
      grouped[currency].total += Number(s.total_inc_vat ?? s.invoice_amount ?? 0);
      grouped[currency].totalAED += toAED(
        s.total_inc_vat ?? s.invoice_amount,
        currency,
        s.exchange_rate_to_aed
      );
    });

    return Object.values(grouped);
  }, [reportSales]);

  const reportTotalAED = reportSales.reduce(
    (sum, s) => sum + toAED(
      s.total_inc_vat ?? s.invoice_amount,
      s.invoice_currency || 'AED',
      s.exchange_rate_to_aed
    ),
    0
  );

  const eligibleCommissions = reportCommissions.filter(
    c => c.approval_status === 'approved' && c.eligibility_status === 'eligible'
  );

  const approvedCommissions = reportCommissions.filter(
    c => c.approval_status === 'approved'
  );

  const rejectedCommissions = reportCommissions.filter(
    c => c.approval_status === 'rejected'
  );

  const reportCommissionCurrencies = [...new Set(
    reportCommissions.map(c => c.commission_currency || 'AED')
  )];

  const commissionTotalsByCurrency = reportCommissionCurrencies.map(currency => {
    const records = reportCommissions.filter(
      c => (c.commission_currency || 'AED') === currency
    );

    const eligible = records
      .filter(c => c.approval_status === 'approved' && c.eligibility_status === 'eligible')
      .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

    const approved = records
      .filter(c => c.approval_status === 'approved')
      .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

    return { currency, eligible, approved };
  });

  const partnerPerformance = partners.map(partner => {
    const partnerSales = reportSales.filter(s => s.partner_id === partner.id);
    const partnerCommissions = reportCommissions.filter(c => c.partner_id === partner.id);

    return {
      partner,
      invoices: partnerSales.length,
      panels: partnerSales.reduce(
        (sum, s) => sum + Number(s.panel_quantity ?? s.quantity ?? 0),
        0
      ),
      salesAED: partnerSales.reduce(
        (sum, s) => sum + toAED(
          s.total_inc_vat ?? s.invoice_amount,
          s.invoice_currency || 'AED',
          s.exchange_rate_to_aed
        ),
        0
      ),
      commissionCount: partnerCommissions.length,
      eligibleCommissionCount: partnerCommissions.filter(
        c => c.approval_status === 'approved' && c.eligibility_status === 'eligible'
      ).length
    };
  }).filter(p => p.invoices || p.commissionCount);

  const payoutTotalsByCurrency = [...new Set(
    reportPayouts.map(p => p.currency || 'AED')
  )].map(currency => ({
    currency,
    paid: reportPayouts
      .filter(p => p.currency === currency && p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0),
    pending: reportPayouts
      .filter(p => p.currency === currency && p.status === 'pending')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0)
  }));

  // ---------------------------------------------------------
  // PARTNER MONTHLY STATEMENT — OWN PARTNER ONLY
  // ---------------------------------------------------------

  const statementSales = isPartner
    ? scopedSales.filter(s => inMonth(s.invoice_date, reportMonth))
    : [];

  const statementCommissions = isPartner
    ? scopedCommissions.filter(c => inMonth(c.sale?.invoice_date, reportMonth))
    : [];

  const statementCommissionIds = new Set(statementCommissions.map(c => c.id));

  // Payment history is based on payment month, not the invoice month.
  const statementPayouts = isPartner
    ? scopedPayouts.filter(p =>
        inMonth(p.payment_date || p.paid_at || p.created_at, reportMonth)
      )
    : [];

  // Profit summary is based on the selected invoice month, so include all payouts
  // linked to those profits regardless of the month the payment occurred.
  const statementPayoutsForInvoices = isPartner
    ? scopedPayouts.filter(p => statementCommissionIds.has(p.commission_id))
    : [];

  const statementSalesByCurrency = [...new Set(
    statementSales.map(s => s.invoice_currency || 'AED')
  )].map(currency => ({
    currency,
    count: statementSales.filter(s => (s.invoice_currency || 'AED') === currency).length,
    panels: statementSales
      .filter(s => (s.invoice_currency || 'AED') === currency)
      .reduce((sum, s) => sum + Number(s.panel_quantity ?? s.quantity ?? 0), 0),
    total: statementSales
      .filter(s => (s.invoice_currency || 'AED') === currency)
      .reduce((sum, s) => sum + Number(s.total_inc_vat ?? s.invoice_amount ?? 0), 0)
  }));

  const statementCommissionTotals = [...new Set(
    statementCommissions.map(c => c.commission_currency || 'AED')
  )].map(currency => {
    const records = statementCommissions.filter(
      c => (c.commission_currency || 'AED') === currency
    );

    const eligible = records
      .filter(c => c.approval_status === 'approved' && c.eligibility_status === 'eligible')
      .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

    const paid = statementPayoutsForInvoices
      .filter(p => p.currency === currency && p.status === 'paid')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const pending = statementPayoutsForInvoices
      .filter(p => p.currency === currency && p.status === 'pending')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return {
      currency,
      eligible,
      paid,
      pending,
      outstanding: Math.max(0, eligible - paid)
    };
  });

  // ---------------------------------------------------------
  // PARTNER / SALES / COMMISSION ACTIONS
  // ---------------------------------------------------------

 
async function addReferral(e) {
  e.preventDefault();
  if (!ownPartner) return;
  setBusy(true); setError('');
  const payload = { ...referralForm, partner_id: ownPartner.id, created_by: session?.user?.id, status: 'New' };
  const { error: insertError } = await supabase.from('referrals').insert(payload);
  if (insertError) { setError(insertError.message); setBusy(false); return; }
  setReferralForm({ contact_name: '', company: '', email: '', phone: '', notes: '' });
  await loadData(); flash('Referral submitted.'); setBusy(false);
}


async function updateReferralStatus(referralId, status) {
  if (!isStaff) return;
  setBusy(true);
  const { error: updateError } = await supabase.from('referrals').update({ status }).eq('id', referralId);
  if (updateError) setError(updateError.message);
  else { await loadData(); flash('Referral status updated.'); }
  setBusy(false);
}


async function sendPartnerInvitation(partnerId) {
  const { data, error } = await supabase.functions.invoke('partner-invite', {
    body: { partner_id: partnerId }
  });
  if (error) {
    let message = error.message || 'Invitation request failed.';
    const context = error.context;
    if (context && typeof context.clone === 'function') {
      const body = await context.clone().json().catch(() => null);
      if (body?.error) message = body.error;
    }
    throw new Error(message);
  }
  if (!data?.success) throw new Error(data?.error || 'Invitation was not confirmed.');
  return data;
}

async function retryPartnerInvite(partner) {
  if (!isAdmin || busy || !partner || partner.user_id || partner.status !== 'active') return;
  setBusy(true);
  setError('');
  try {
    await sendPartnerInvitation(partner.id);
    await loadData();
    flash(`Invitation sent to ${partner.email || partner.full_name}.`);
  } catch (err) {
    setError(`Invitation failed for ${partner.partner_code}: ${err.message || 'Please try again.'}`);
  } finally {
    setBusy(false);
  }
}

async function addPartner(e) {
  e.preventDefault();
  setBusy(true);
  setError('');

  let createdPartner = null;
  try {
    const payload = {
      ...partnerForm,
      parent_partner_id: partnerForm.parent_partner_id || null,
      social_media_profiles: Object.fromEntries(Object.entries(partnerForm.social_media_profiles || {}).filter(([platform, value]) => String(value || '').trim()))
    };

    const { data, error: insertError } = await supabase
      .from('partners')
      .insert(payload)
      .select('id, partner_code, full_name, email')
      .single();

    if (insertError) throw insertError;
    createdPartner = data;

    setShowPartner(false);
    setPartnerForm({
      full_name: '',
      email: '',
      phone: '',
      date_of_birth: '',
      partner_type: 'Interior Designer',
      parent_partner_id: '',
      social_media_profiles: {}
    });

    await loadData();

    if (isAdmin) {
      try {
        await sendPartnerInvitation(data.id);
        await loadData();
        flash(`Partner created and invitation sent: ${data.partner_code}`);
      } catch (inviteErr) {
        setError(`Partner registered (${data.partner_code}), but the invitation failed. Use “Send invite” in the Actions column to retry. ${inviteErr.message || ''}`);
      }
    } else {
      flash(`Partner registered (${data.partner_code}). An Admin must send the login invitation.`);
    }
  } catch (err) {
    setError(err.message || 'Unable to create partner.');
    if (!createdPartner) await loadData();
  } finally {
    setBusy(false);
  }
}


  const invoiceQty = Number(saleForm.quantity || 0);
  const invoiceUnit = Number(saleForm.unit_price || 0);
  const extraCost = Number(saleForm.additional_cost_amount || 0);
  const panelSubtotal = invoiceQty * invoiceUnit;
  const invoiceSubtotal = panelSubtotal + extraCost;
  const vatAmount = invoiceSubtotal * 0.05;
  const invoiceTotal = invoiceSubtotal + vatAmount;
  const tier = commissionTier(invoiceQty);
  const estimatedCommission = tier.rate === null
    ? null
    : invoiceSubtotal * tier.rate / 100;

  function updateSaleCurrency(currency) {
    const price = productPrices.find(p => p.panel_size === saleForm.panel_size);
    const usdPrice = Number(
      price?.unit_price ?? (saleForm.panel_size === '40x120' ? 1350 : 900)
    );

    setSaleForm(f => ({
      ...f,
      invoice_currency: currency,
      unit_price: String(currency === 'AED' ? usdPrice * USD_TO_AED : usdPrice)
    }));
  }

  function updatePanelSize(size) {
    const price = productPrices.find(p => p.panel_size === size);
    const usdPrice = Number(price?.unit_price ?? (size === '40x120' ? 1350 : 900));

    setSaleForm(f => ({
      ...f,
      panel_size: size,
      unit_price: String(f.invoice_currency === 'AED' ? usdPrice * USD_TO_AED : usdPrice)
    }));
  }

  async function addSale(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const { data, error: saveError } = await supabase.rpc('sunora_create_sale_bundle', {
      p_partner_id: saleForm.partner_id,
      p_referral_id: saleForm.referral_id || null,
      p_invoice_number: saleForm.invoice_number.trim(),
      p_invoice_date: saleForm.invoice_date,
      p_country: saleForm.country,
      p_invoice_currency: saleForm.invoice_currency,
      p_panel_size: saleForm.panel_size,
      p_panel_quantity: invoiceQty,
      p_unit_price: invoiceUnit,
      p_additional_cost_description: saleForm.additional_cost_description.trim(),
      p_additional_cost_amount: extraCost,
      p_savings_rate: Number(saleForm.savings_rate),
      p_notes: saleForm.notes
    });

    if (saveError) {
      setBusy(false);
      setError(saveError.message);
      return;
    }

    const result = data || {};
    const invoiceNumber = result.invoice_number || saleForm.invoice_number.trim();
    const created = result.created === true;

    setBusy(false);
    setShowSale(false);

    setSaleForm({
      partner_id: '',
      referral_id: '',
      invoice_number: '',
      invoice_date: currentDubaiDate(),
      country: 'United Arab Emirates',
      invoice_currency: 'AED',
      panel_size: '60x60',
      product_description: 'Sunora Wellness Panel',
      quantity: '1',
      unit_price: String(900 * USD_TO_AED),
      additional_cost_description: '',
      additional_cost_amount: '0',
      savings_rate: '10',
      notes: ''
    });

    await loadData();

    flash(
      created
        ? (tier.rate === null
            ? `Invoice ${invoiceNumber} and profit record saved. Profit rate above 150 panels requires manual approval.`
            : `Invoice ${invoiceNumber} and profit record saved. Profit is recorded, not yet approved or payable.`)
        : `Invoice ${invoiceNumber} already existed. The retry completed without creating duplicates.`
    );
  }

  async function saveCommissionDecision(e) {
    e.preventDefault();

    if (!isAdmin || !selectedCommission) return;

    if (commissionDecision === 'rejected' && !approvalComments.trim()) {
      setError('Please enter a rejection reason.');
      return;
    }

    setBusy(true);
    setError('');

    const { error: updateError } = await supabase
      .from('sale_commissions')
      .update({
        approval_status: commissionDecision,
        approval_comments: approvalComments.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedCommission.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSelectedCommission(null);
    setApprovalComments('');
    await loadData();

    flash(
      commissionDecision === 'approved'
        ? 'Profit approved. Eligibility is checked separately.'
        : 'Profit rejected. The reason has been recorded.'
    );
  }

  async function saveManualRate(e) {
    e.preventDefault();

    if (!isAdmin || !selectedRateCommission) return;

    const rate = Number(manualRate);

    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError('Enter a profit rate between 0 and 100.');
      return;
    }

    const amount = Number(
      (Number(selectedRateCommission.commissionable_base_amount || 0) * rate / 100).toFixed(2)
    );

    setBusy(true);
    setError('');

    const { error: updateError } = await supabase
      .from('sale_commissions')
      .update({
        commission_rate: rate,
        commission_amount: amount,
        rate_status: 'manually_approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedRateCommission.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSelectedRateCommission(null);
    setManualRate('');
    await loadData();
    flash('Manual profit rate approved. You can now approve or reject this profit.');
  }

  async function saveProjectReview(e) {
    e.preventDefault();

    if (!isAdmin || !selectedProject) return;

    setBusy(true);
    setError('');

    const { error: updateError } = await supabase
      .from('sales')
      .update({
        final_client_payment_received: projectReview.final_client_payment_received,
        final_deliverables_submitted: projectReview.final_deliverables_submitted,
        qc_passed: projectReview.qc_passed,
        client_accepted: projectReview.client_accepted,
        completion_comments: projectReview.completion_comments.trim() || null
      })
      .eq('id', selectedProject.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSelectedProject(null);
    await loadData();
    flash('Project completion review saved. Profit eligibility has been recalculated.');
  }

  function openCommissionDecision(c, decision) {
    setSelectedCommission(c);
    setCommissionDecision(decision);
    setApprovalComments(c.approval_comments || '');
  }

  function openProjectReview(c) {
    const s = c.sale || {};

    setSelectedProject({
      id: s.id,
      invoice_number: s.invoice_number,
      commission_id: c.id
    });

    setProjectReview({
      final_client_payment_received: !!s.final_client_payment_received,
      final_deliverables_submitted: !!s.final_deliverables_submitted,
      qc_passed: !!s.qc_passed,
      client_accepted: !!s.client_accepted,
      completion_comments: s.completion_comments || ''
    });
  }

  async function createProfitPayout(commission) {
    if (!isStaff || busy || !commission) return;
    setBusy(true);
    setError('');
    const { error: payoutError } = await supabase.rpc('sunora_create_profit_payout', {
      p_commission_id: commission.id,
      p_notes: null
    });
    setBusy(false);
    if (payoutError) {
      setError(payoutError.message);
      return;
    }
    await loadData();
    flash('Pending profit payout created. Admin confirmation is required to mark it paid.');
  }

  function openProfitPayoutPayment(payout) {
    const commission = commissions.find(c => c.id === payout.commission_id);
    setSelectedPayout({
      id: payout.id,
      commission_id: payout.commission_id,
      amount: payout.amount,
      currency: payout.currency,
      invoice_number: commission?.sale?.invoice_number || '—',
      partner_name: commission?.partner?.full_name || '—'
    });
    setPayoutPaymentForm({
      payment_date: currentDubaiDate(),
      payment_reference: '',
      notes: payout.notes || ''
    });
  }

  async function markProfitPayoutPaid(e) {
    e.preventDefault();
    if (!isAdmin || !selectedPayout) return;
    if (!payoutPaymentForm.payment_date || !payoutPaymentForm.payment_reference.trim()) {
      setError('Payment date and reference are required.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: paidError } = await supabase.rpc('sunora_mark_profit_payout_paid', {
      p_payout_id: selectedPayout.id,
      p_payment_date: payoutPaymentForm.payment_date,
      p_payment_reference: payoutPaymentForm.payment_reference.trim(),
      p_notes: payoutPaymentForm.notes.trim() || null
    });
    setBusy(false);
    if (paidError) {
      setError(paidError.message);
      return;
    }
    setSelectedPayout(null);
    setPayoutPaymentForm({ payment_date: currentDubaiDate(), payment_reference: '', notes: '' });
    await loadData('admin');
    flash('Profit payout marked paid and recorded.');
  }

  async function addPayment(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const { error: paymentError } = await supabase
      .from('payments')
      .insert({
        ...paymentForm,
        amount: Number(paymentForm.amount)
      });

    setBusy(false);

    if (paymentError) {
      setError(paymentError.message);
      return;
    }

    setShowPayment(false);
    setPaymentForm({
      partner_id: '',
      amount: '',
      payment_date: currentDubaiDate(),
      reference: '',
      notes: ''
    });

    await loadData();
    flash('Payment recorded.');
  }

  async function markNotificationRead(id) {
    if (!session) return;

    const readAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setNotifications(current =>
      current.map(n => n.id === id ? { ...n, read_at: readAt } : n)
    );

    flash('Notification marked as read.');
  }

  function exportCsv() {
    if (tab === 'Profit Ledger') {
      const profitRows = scopedCommissions.map(c => ({
        profit_id: c.id,
        invoice_number: c.sale?.invoice_number || '',
        partner_name: c.partner?.full_name || '',
        partner_id: c.partner?.partner_code || '',
        panel_quantity: c.panel_quantity,
        profit_tier: c.tier_code,
        profit_base_amount: c.commissionable_base_amount,
        currency: c.commission_currency,
        profit_rate: c.commission_rate,
        profit_amount: c.commission_amount,
        rate_status: c.rate_status,
        approval_status: c.approval_status,
        eligibility_status: c.eligibility_status,
        approval_comments: c.approval_comments || '',
        created_at: c.created_at,
        approved_at: c.approved_at,
        eligibility_approved_at: c.eligibility_approved_at
      }));
      downloadCsv(profitRows, 'sunora-profit-ledger.csv');
      return;
    }

    let rows = [];

    if (tab === 'Sales & Invoices') rows = scopedSales;
    else if (tab === 'Payments') rows = scopedPayments;
    else if (tab === 'Referrals' || tab === 'My Referrals') rows = scopedReferrals;
    else rows = scopedPartners;

    const exportRows = rows.map(row => {
      const clean = { ...row };
      delete clean.partner;
      delete clean.sale;
      delete clean.parent;
      if (tab === 'Channel Partners' && clean.social_media_profiles) {
        clean.social_media_profiles = Object.entries(clean.social_media_profiles)
          .filter(([, value]) => String(value || '').trim())
          .map(([platform, value]) => `${platform}: ${value}`)
          .join(' | ');
      }
      return clean;
    });

    downloadCsv(
      exportRows,
      `sunora-${tab.toLowerCase().replaceAll(' ', '-')}.csv`
    );
  }

  function exportMonthlyReport() {
    if (!isAdmin) return;

    const rows = reportSales.map(s => ({
      invoice_number: s.invoice_number,
      invoice_date: s.invoice_date,
      partner: s.partner?.full_name || '',
      partner_code: s.partner?.partner_code || '',
      currency: s.invoice_currency,
      panels: s.panel_quantity ?? s.quantity,
      subtotal_ex_vat: s.subtotal_ex_vat,
      vat: s.vat_amount,
      total_inc_vat: s.total_inc_vat ?? s.invoice_amount,
      exchange_rate_to_aed: s.exchange_rate_to_aed,
      total_aed: toAED(
        s.total_inc_vat ?? s.invoice_amount,
        s.invoice_currency || 'AED',
        s.exchange_rate_to_aed
      )
    }));

    downloadCsv(rows, `sunora-monthly-report-${reportMonth}.csv`);
  }

  function exportPartnerStatement() {
    if (!isPartner || !ownPartner) return;

    const summaryRows = statementCommissionTotals.map(x => ({
      record_type: 'SUMMARY',
      invoice_number: '',
      date: '',
      partner_name: ownPartner.full_name,
      partner_code: ownPartner.partner_code,
      panels: '',
      currency: x.currency,
      subtotal_ex_vat: '',
      vat: '',
      total_inc_vat: '',
      profit_base: '',
      profit_rate: '',
      profit_amount: '',
      approval_status: '',
      eligibility_status: '',
      payment_status: '',
      payment_reference: '',
      eligible_profit: x.eligible,
      paid_profit: x.paid,
      pending_profit: x.pending,
      outstanding_estimate: x.outstanding
    }));

    const saleRows = statementSales.map(s => ({
      record_type: 'SALE',
      invoice_number: s.invoice_number,
      date: s.invoice_date,
      partner_name: ownPartner.full_name,
      partner_code: ownPartner.partner_code,
      panels: s.panel_quantity ?? s.quantity,
      currency: s.invoice_currency,
      subtotal_ex_vat: s.subtotal_ex_vat,
      vat: s.vat_amount,
      total_inc_vat: s.total_inc_vat ?? s.invoice_amount,
      profit_base: '',
      profit_rate: '',
      profit_amount: '',
      approval_status: '',
      eligibility_status: '',
      payment_status: '',
      payment_reference: '',
      eligible_profit: '',
      paid_profit: '',
      pending_profit: '',
      outstanding_estimate: ''
    }));

    const profitRows = statementCommissions.map(c => ({
      record_type: 'PROFIT',
      invoice_number: c.sale?.invoice_number || '',
      date: c.sale?.invoice_date || '',
      partner_name: ownPartner.full_name,
      partner_code: ownPartner.partner_code,
      panels: c.panel_quantity,
      currency: c.commission_currency,
      subtotal_ex_vat: '',
      vat: '',
      total_inc_vat: '',
      profit_base: c.commissionable_base_amount,
      profit_rate: c.commission_rate,
      profit_amount: c.commission_amount,
      approval_status: c.approval_status,
      eligibility_status: c.eligibility_status,
      payment_status: '',
      payment_reference: '',
      eligible_profit: '',
      paid_profit: '',
      pending_profit: '',
      outstanding_estimate: ''
    }));

    const payoutRows = statementPayouts.map(p => {
      const commission = scopedCommissions.find(c => c.id === p.commission_id);
      return {
        record_type: 'PAYOUT',
        invoice_number: commission?.sale?.invoice_number || '',
        date: p.payment_date || p.paid_at?.slice(0, 10) || p.created_at?.slice(0, 10) || '',
        partner_name: ownPartner.full_name,
        partner_code: ownPartner.partner_code,
        panels: '',
        currency: p.currency,
        subtotal_ex_vat: '',
        vat: '',
        total_inc_vat: '',
        profit_base: '',
        profit_rate: '',
        profit_amount: p.amount,
        approval_status: '',
        eligibility_status: '',
        payment_status: p.status,
        payment_reference: p.payment_reference || '',
        eligible_profit: '',
        paid_profit: '',
        pending_profit: '',
        outstanding_estimate: ''
      };
    });

    const rows = [...summaryRows, ...saleRows, ...profitRows, ...payoutRows];
    downloadCsv(rows, `sunora-my-statement-${reportMonth}.csv`);
  }

  function exportPartnerStatementPdf() {
    if (!isPartner || !ownPartner) return;

    const payoutRows = statementPayouts.map(p => {
      const commission = scopedCommissions.find(c => c.id === p.commission_id);
      return {
        ...p,
        date: p.payment_date || p.paid_at?.slice(0, 10) || p.created_at?.slice(0, 10) || '',
        payment_reference: p.payment_reference || '',
        invoice_number: commission?.sale?.invoice_number || ''
      };
    });

    const pdfBytes = buildPartnerStatementPdf({
      month: reportMonth,
      monthLabel: monthLabel(reportMonth),
      partner: {
        full_name: ownPartner.full_name,
        partner_code: ownPartner.partner_code,
        status: ownPartner.status
      },
      sales: statementSales,
      profits: statementCommissions.map(c => ({
        ...c,
        invoice_number: c.sale?.invoice_number || '',
        invoice_date: c.sale?.invoice_date || ''
      })),
      profitSummary: statementCommissionTotals,
      payouts: payoutRows
    });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sunora-my-statement-' + reportMonth + '.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!isSupabaseConfigured) return <SetupScreen />;

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading Sunora Portal…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <img className="auth-logo" src="/sunora-logo.png" alt="Sunora" />
          <div className="eyebrow">CHANNEL PARTNER PORTAL</div>
          <h1>Welcome back</h1>
          <p className="muted">Sign in to manage your Sunora partner account.</p>

          <form onSubmit={signIn} className="form-stack">
            <label>
              Email address
              <input
                type="email"
                required
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                required
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </label>

            {error && <div className="alert error"><CircleAlert size={17} />{error}</div>}

            <button className="primary-btn wide" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in securely'}
            </button>
          </form>

          <p className="auth-foot">
            <ShieldCheck size={15} /> Secure access for authorised users only
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="center-card">
        <CircleAlert />
        <h2>Account not assigned</h2>
        <p>Your login is valid, but an administrator must assign a Sunora portal profile and role.</p>
        {error && <p className="error-text">{error}</p>}
        <button className="secondary-btn" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  const visibleNav = [
    ...nav,
    ...(isStaff ? [{ name: 'Profit Payouts', icon: CreditCard }] : []),
    { name: isPartner ? 'My Referrals' : 'Referrals', icon: GitBranch },
    ...(profile ? [{ name: 'Notifications', icon: Bell }] : []),
    ...(isAdmin ? [{ name: 'Monthly Reports', icon: ChartNoAxesCombined }] : []),
    ...(isPartner ? [{ name: 'My Monthly Statement', icon: ClipboardList }] : [])
  ];

  const unreadNotificationCount = notifications.filter(n => !n.read_at).length;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
        <div className="brand">
          <img src="/sunora-logo.png" alt="Sunora — Your Wellness Sun" />
          <div>
            <span>PARTNER PORTAL</span>
            <small>YOUR WELLNESS SUN</small>
          </div>
          <button className="icon-btn mobile-close" onClick={() => setMobileNav(false)}>
            <X />
          </button>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <nav>
          {visibleNav.map(item => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`nav-item ${tab === item.name ? 'active' : ''}`}
                onClick={() => {
                  setTab(item.name);
                  setMobileNav(false);
                  setSearch('');
                }}
              >
                <Icon size={18} />
                <span>{item.name}</span>

                {item.name === 'Channel Partners' && (
                  <span className="nav-count">{scopedPartners.length}</span>
                )}

                {item.name === 'Notifications' && unreadNotificationCount > 0 && (
                  <span className="nav-count">{unreadNotificationCount}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="secure-note">
            <ShieldCheck size={17} />
            <div>
              <b>Secure workspace</b>
              <small>Role-based access enabled</small>
            </div>
          </div>

          <div className="user-block">
            <div className="avatar">
              {(profile.full_name || session.user.email || 'S').slice(0, 1).toUpperCase()}
            </div>
            <div className="user-info">
              <b>{profile.full_name || session.user.email}</b>
              <small>{profile.role.toUpperCase()}</small>
            </div>
            <button title="Sign out" className="icon-btn" onClick={signOut}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {mobileNav && <div className="scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileNav(true)}>
            <Menu />
          </button>

          <div>
            <div className="breadcrumb">Sunora <span>/</span> {tab}</div>
            <h1>{tab}</h1>
          </div>

          <div className="top-actions">
            <span className="live-dot">Live workspace</span>
            <button className="icon-btn" onClick={() => loadData()} title="Refresh data">
              <RefreshCw size={17} />
            </button>

            {isStaff && (
              <button className="primary-btn top-add" onClick={() => setShowPartner(true)}>
                <Plus size={17} /> Add partner
              </button>
            )}
          </div>
        </header>

        {notice && <div className="alert success"><CheckCircle2 size={17} />{notice}</div>}

        {error && (
          <div className="alert error">
            <CircleAlert size={17} />{error}
            <button className="alert-close" onClick={() => setError('')}><X size={15} /></button>
          </div>
        )}

        {tab === 'Dashboard' && (
          <>
            <section className="welcome-panel">
              <div>
                <div className="eyebrow">SUNORA · PARTNER NETWORK</div>
                <h2>Good to see you, {(profile.full_name || 'Partner').split(' ')[0]}.</h2>
                <p>Your sales, savings and partner activity — all in one place.</p>
              </div>
              <div className="welcome-sun"><Sun size={54} /></div>
            </section>

            <section className="stats-grid">
              <Stat icon={Users} label={isStaff ? 'Total partners' : 'My partners'} value={branchPartnerCount} foot="Registered network" />
              <Stat icon={TrendingUp} label="Total sales" value={money(isStaff ? totalSales : effectiveSales)} foot="Invoice value recorded" />
              <Stat icon={Wallet} label="Channel Partner Savings" value={money(isStaff ? totalSavings : effectiveSavings)} foot="Earned savings · not deducted from sales" />
              <Stat icon={CreditCard} label="Outstanding savings" value={money(isStaff ? totalDue : Math.max(0, effectiveSavings - effectivePaid))} foot="Pending settlement" />
            </section>

            <section className="content-grid">
              <div className="panel">
                <PanelHeading
                  title="Recent invoices"
                  subtitle="Latest sales entered in the portal"
                  action={<button className="text-btn" onClick={() => setTab('Sales & Invoices')}>View all <ArrowUpRight size={15} /></button>}
                />
                <SalesTable rows={(isStaff ? sales : scopedSales).slice(0, 5)} empty="No invoices have been recorded yet." />
              </div>

              <div className="panel">
                <PanelHeading title="Quick actions" subtitle="Common tasks" />
                <div className="quick-actions">
                  {isStaff && (
                    <button onClick={() => setShowPartner(true)}>
                      <span className="quick-icon"><Users /></span>
                      <span><b>Register partner</b><small>Create a new partner ID</small></span>
                      <ArrowUpRight />
                    </button>
                  )}
                  {isStaff && (
                    <button onClick={() => setShowSale(true)}>
                      <span className="quick-icon"><ReceiptText /></span>
                      <span><b>Record invoice</b><small>Create invoice and profit record</small></span>
                      <ArrowUpRight />
                    </button>
                  )}
                  <button onClick={() => setTab('Referral Network')}>
                    <span className="quick-icon"><GitBranch /></span>
                    <span><b>Explore referrals</b><small>View your partner network</small></span>
                    <ArrowUpRight />
                  </button>
                  {isStaff && (
                    <button onClick={() => setShowPayment(true)}>
                      <span className="quick-icon"><CreditCard /></span>
                      <span><b>Record payment</b><small>Settle partner savings</small></span>
                      <ArrowUpRight />
                    </button>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {tab === 'Channel Partners' && (
          <section className="panel">
            <PanelHeading
              title="Channel partners"
              subtitle={`${visiblePartners.length} matching records`}
              action={isStaff && <button className="primary-btn" onClick={() => setShowPartner(true)}><Plus size={16} /> Register partner</button>}
            />
            <Toolbar search={search} setSearch={setSearch} exportCsv={exportCsv} />
            <PartnersTable rows={visiblePartners} onSelect={p => setSearch(p.partner_code)} isAdmin={isAdmin} busy={busy} onInvite={retryPartnerInvite} />
          </section>
        )}

        {(tab === 'Referrals' || tab === 'My Referrals') && (
          <section className="panel">
            <PanelHeading title={isPartner ? 'My referrals' : 'Referral pipeline'} subtitle={isPartner ? 'Submit leads and track their progress' : 'Track partner-submitted leads across the pipeline'} action={isPartner && <button className="primary-btn" onClick={() => document.getElementById('referral-form')?.scrollIntoView({ behavior: 'smooth' })}><Plus size={16}/> Add referral</button>} />
            {isPartner && <form id="referral-form" className="form-grid referral-form" onSubmit={addReferral}>
              <label>Contact name *<input required value={referralForm.contact_name} onChange={e=>setReferralForm(f=>({...f,contact_name:e.target.value}))} /></label>
              <label>Company<input value={referralForm.company} onChange={e=>setReferralForm(f=>({...f,company:e.target.value}))}/></label>
              <label>Email<input type="email" value={referralForm.email} onChange={e=>setReferralForm(f=>({...f,email:e.target.value}))}/></label>
              <label>Phone<input value={referralForm.phone} onChange={e=>setReferralForm(f=>({...f,phone:e.target.value}))}/></label>
              <label className="full-field">Notes<textarea rows="3" value={referralForm.notes} onChange={e=>setReferralForm(f=>({...f,notes:e.target.value}))}/></label>
              <div className="modal-actions"><button className="primary-btn" disabled={busy}>{busy?'Submitting…':'Submit referral'}</button></div>
            </form>}
            <div className="table-wrap">
              <table><thead><tr>{isStaff && <th>Partner</th>}<th>Lead</th><th>Company</th><th>Contact</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>{scopedReferrals.map(r=><tr key={r.id}>{isStaff&&<td><b>{r.partner?.full_name||'Partner'}</b><small>{r.partner?.partner_code||''}</small></td>}<td><b>{r.contact_name}</b></td><td>{r.company||'—'}</td><td>{r.email||r.phone||'—'}</td><td>{dateLabel(r.created_at?.slice(0,10))}</td><td>{isStaff?<select className="referral-status-select" value={r.status} onChange={e=>updateReferralStatus(r.id,e.target.value)}>{['New','Contacted','Qualified','Converted','Lost'].map(s=><option key={s}>{s}</option>)}</select>:<span className="status">{r.status}</span>}</td></tr>)}</tbody>
              </table>{!scopedReferrals.length&&<Empty text="No referrals yet."/>}
            </div>
          </section>
        )}

        {tab === 'Referral Network' && (
          <section className="panel">
            <PanelHeading title="Referral network" subtitle="Parent-child relationships across the partner network" />
            <div className="branch-list">
              {branchNetworkRoots.map(p => (
                <BranchNode
                  key={p.id}
                  partner={p}
                  all={isStaff ? partners : branchNetworkRows}
                  depth={0}
                />
              ))}
            </div>
          </section>
        )}

        {tab === 'Sales & Invoices' && (
          <section className="panel">
            <PanelHeading
              title="Sales & invoices"
              subtitle="Invoice references entered from Zoho Books"
              action={isStaff && <button className="primary-btn" onClick={() => setShowSale(true)}><Plus size={16} /> Record invoice</button>}
            />
            <Toolbar search={search} setSearch={setSearch} exportCsv={exportCsv} />
            <SalesTable
              rows={(isStaff ? sales : scopedSales).filter(s =>
                [s.invoice_number, s.partner?.partner_code, s.partner?.full_name, s.product_description]
                  .some(v => String(v || '').toLowerCase().includes(search.toLowerCase()))
              )}
            />
          </section>
        )}

        {tab === 'Profit Ledger' && (
          <section className="panel">
            <PanelHeading title="Profit ledger" subtitle="Per-invoice profit, calculated before VAT" />

            <div className="ledger-summary commission-summary">
              <div><span>Profit records</span><b>{scopedCommissions.length}</b></div>
              <div><span>Awaiting manual profit rate</span><b>{scopedCommissions.filter(c => c.rate_status === 'awaiting_manual_rate').length}</b></div>
              <div><span>Approved</span><b>{scopedCommissions.filter(c => c.approval_status === 'approved').length}</b></div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th><th>Partner</th><th>Panels</th><th>Tier</th>
                    <th>Profit base</th><th>Rate</th><th>Profit</th>
                    <th>Approval</th><th>Eligibility</th>
                    {isAdmin && <th>Admin actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {scopedCommissions.map(c => (
                    <tr key={c.id}>
                      <td className="code">{c.sale?.invoice_number || '—'}</td>
                      <td><b>{c.partner?.full_name || '—'}</b><small>{c.partner?.partner_code}</small></td>
                      <td>{c.panel_quantity}</td>
                      <td>{c.tier_code === 'manual_over_150' ? 'Manual >150' : c.tier_code.replaceAll('_', ' ')}</td>
                      <td>{money(c.commissionable_base_amount, c.commission_currency)}</td>
                      <td>{c.commission_rate === null ? 'Pending' : `${c.commission_rate}%`}</td>
                      <td className="gold-text">{c.commission_amount === null ? 'Pending' : money(c.commission_amount, c.commission_currency)}</td>
                      <td>
                        <span className={`status ${c.approval_status === 'approved' ? '' : c.approval_status === 'rejected' ? 'inactive' : 'pending'}`}>
                          {c.approval_status}
                        </span>
                        {c.approval_comments && <small>{c.approval_comments}</small>}
                      </td>
                      <td><span className={`status ${c.eligibility_status === 'eligible' ? '' : 'inactive'}`}>{c.eligibility_status.replaceAll('_', ' ')}</span></td>
                      {isAdmin && (
                        <td>
                          <div className="admin-actions">
                            {c.rate_status === 'awaiting_manual_rate' && c.approval_status === 'recorded' && (
                              <button className="mini-btn" onClick={() => { setSelectedRateCommission(c); setManualRate(''); }}>Set rate</button>
                            )}
                            {c.approval_status === 'recorded' && (
                              <>
                                <button className="mini-btn" disabled={c.rate_status === 'awaiting_manual_rate' || c.commission_amount === null} onClick={() => openCommissionDecision(c, 'approved')}>Approve</button>
                                <button className="mini-btn danger" onClick={() => openCommissionDecision(c, 'rejected')}>Reject</button>
                              </>
                            )}
                            <button className="mini-btn" onClick={() => openProjectReview(c)}>Project review</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!scopedCommissions.length && <Empty text="No profit records yet. New invoices will appear here." />}
            </div>

            {isAdmin && (
              <div className="audit-panel">
                <PanelHeading title="Approval & completion history" subtitle="Latest recorded admin actions" />
                {auditLogs.filter(a => ['sale_commission', 'sale'].includes(a.entity_type)).slice(0, 12).length ? (
                  <div className="audit-list">
                    {auditLogs.filter(a => ['sale_commission', 'sale'].includes(a.entity_type)).slice(0, 12).map(a => (
                      <div className="audit-item" key={a.id}>
                        <div>
                          <b>{String(a.action || '').replaceAll('_', ' ')}</b>
                          <small>{a.entity_type} · {a.entity_id} · By {a.actor_id === session?.user?.id ? (profile.full_name || 'Current admin') : (a.actor_id || 'System')}</small>
                        </div>
                        <time>{new Date(a.created_at).toLocaleString()}</time>
                        <details><summary>Details</summary><pre>{JSON.stringify(a.details, null, 2)}</pre></details>
                      </div>
                    ))}
                  </div>
                ) : <Empty text="No approval or completion actions have been recorded yet." />}
              </div>
            )}
          </section>
        )}

        {tab === 'Profit Payouts' && isStaff && (
          <section className="panel">
            <PanelHeading
              title="Accounts · Profit Payouts"
              subtitle="Full profit payments only — staff can create pending payouts, Admin confirms payment"
            />
            <div className="report-stats three">
              <Stat icon={BadgePercent} label="Eligible profits" value={payableProfits.length} foot="Approved and project-completion eligible" />
              <Stat icon={CreditCard} label="Pending payouts" value={scopedPayouts.filter(p => p.status === 'pending').length} foot="Awaiting Admin confirmation" />
              <Stat icon={CheckCircle2} label="Paid payouts" value={scopedPayouts.filter(p => p.status === 'paid').length} foot="Confirmed payments" />
            </div>

            <div className="report-section">
              <PanelHeading title="Payable balance by currency" subtitle="Pending amounts are reserved; available balances exclude pending and paid payouts" />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Currency</th><th>Eligible profit</th><th>Pending</th><th>Paid</th><th>Available</th></tr></thead>
                  <tbody>
                    {payoutSummaryByCurrency.map(x => (
                      <tr key={x.currency}>
                        <td><b>{x.currency}</b></td>
                        <td>{money(x.eligible, x.currency)}</td>
                        <td>{money(x.pending, x.currency)}</td>
                        <td>{money(x.paid, x.currency)}</td>
                        <td className="gold-text">{money(x.available, x.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!payoutSummaryByCurrency.length && <Empty text="No eligible profit balances yet." />}
              </div>
            </div>

            <div className="report-section">
              <PanelHeading title="Available eligible profits" subtitle="Create a single full payout for each eligible profit record" />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Partner</th><th>Panels</th><th>Rate</th><th>Profit amount</th><th>Action</th></tr></thead>
                  <tbody>
                    {availableProfits.map(c => (
                      <tr key={c.id}>
                        <td className="code">{c.sale?.invoice_number || '—'}</td>
                        <td><b>{c.partner?.full_name || '—'}</b><small>{c.partner?.partner_code}</small></td>
                        <td>{c.panel_quantity}</td>
                        <td>{c.commission_rate}%</td>
                        <td className="gold-text">{money(c.commission_amount, c.commission_currency)}</td>
                        <td><button className="mini-btn" disabled={busy} onClick={() => createProfitPayout(c)}>Create pending payout</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!availableProfits.length && <Empty text="No eligible profits are awaiting a payout record." />}
              </div>
            </div>

            <div className="report-section">
              <PanelHeading title="Payout register" subtitle="Payment references, dates and audit-backed status" />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Partner</th><th>Amount</th><th>Currency</th><th>Status</th><th>Payment date</th><th>Reference</th><th>Action</th></tr></thead>
                  <tbody>
                    {scopedPayouts.map(p => {
                      const c = commissions.find(x => x.id === p.commission_id);
                      return (
                        <tr key={p.id}>
                          <td className="code">{c?.sale?.invoice_number || '—'}</td>
                          <td><b>{c?.partner?.full_name || '—'}</b><small>{c?.partner?.partner_code || ''}</small></td>
                          <td className="gold-text">{money(p.amount, p.currency)}</td>
                          <td>{p.currency}</td>
                          <td><span className={"status " + (p.status === 'paid' ? '' : 'pending')}>{p.status}</span></td>
                          <td>{dateLabel(p.payment_date || p.paid_at?.slice(0, 10))}</td>
                          <td>{p.payment_reference || '—'}</td>
                          <td>{isAdmin && p.status === 'pending' && <button className="mini-btn" disabled={busy} onClick={() => openProfitPayoutPayment(p)}>Mark paid</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!scopedPayouts.length && <Empty text="No profit payout records have been created." />}
              </div>
            </div>

            <div className="form-hint report-note">
              Payouts are never partial: each eligible profit can have one full payout only. Staff can create pending records; only Admin can confirm payment. The database rechecks eligibility, locks the profit row, prevents duplicate payouts and overpayments, and records audit and partner notifications.
            </div>
          </section>
        )}

        {tab === 'Savings Ledger' && (
          <section className="panel">
            <PanelHeading title="Channel Partner Savings" subtitle="Savings accrue separately and are never deducted from invoice totals" />
            <div className="ledger-summary">
              <div><span>Total earned</span><b>{money(isStaff ? totalSavings : effectiveSavings)}</b></div>
              <div><span>Total paid</span><b>{money(isStaff ? totalPaid : effectivePaid)}</b></div>
              <div><span>Outstanding</span><b>{money(isStaff ? totalDue : Math.max(0, effectiveSavings - effectivePaid))}</b></div>
            </div>

            <div className="table-wrap">
              <table>
                <thead><tr><th>Invoice</th><th>Partner</th><th>Date</th><th>Invoice amount</th><th>Rate</th><th>Savings</th></tr></thead>
                <tbody>
                  {(isStaff ? sales : scopedSales).map(s => (
                    <tr key={s.id}>
                      <td className="code">{s.invoice_number}</td>
                      <td><b>{s.partner?.full_name || '—'}</b><small>{s.partner?.partner_code}</small></td>
                      <td>{dateLabel(s.invoice_date)}</td>
                      <td>{money(s.invoice_amount, s.invoice_currency || 'AED')}</td>
                      <td>{s.savings_rate}%</td>
                      <td className="gold-text">{money(s.savings_amount, s.invoice_currency || 'AED')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!scopedSales.length && <Empty text="No savings entries yet." />}
            </div>
          </section>
        )}

        {tab === 'Payments' && (
          <section className="panel">
            <PanelHeading
              title="Payments & settlements"
              subtitle="Manual payment history against earned savings"
              action={isStaff && <button className="primary-btn" onClick={() => setShowPayment(true)}><Plus size={16} /> Record payment</button>}
            />
            <Toolbar search={search} setSearch={setSearch} exportCsv={exportCsv} />

            <div className="table-wrap">
              <table>
                <thead><tr><th>Partner</th><th>Payment date</th><th>Amount</th><th>Reference</th><th>Notes</th></tr></thead>
                <tbody>
                  {(isStaff ? payments : scopedPayments)
                    .filter(p => [p.partner?.full_name, p.partner?.partner_code, p.reference]
                      .some(v => String(v || '').toLowerCase().includes(search.toLowerCase())))
                    .map(p => (
                      <tr key={p.id}>
                        <td><b>{p.partner?.full_name || '—'}</b><small>{p.partner?.partner_code}</small></td>
                        <td>{dateLabel(p.payment_date)}</td>
                        <td className="gold-text">{money(p.amount)}</td>
                        <td>{p.reference || '—'}</td>
                        <td>{p.notes || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!scopedPayments.length && <Empty text="No payments recorded yet." />}
            </div>
          </section>
        )}

        {/* USER NOTIFICATIONS — RLS limits rows to the current user */}
        {tab === 'Notifications' && profile && (
          <section className="panel">
            <PanelHeading
              title={isAdmin ? "Admin Notifications" : "My Notifications"}
              subtitle={isAdmin ? "Important activity across the Sunora partner portal" : "Updates related to your account and referrals"}
              action={
                <button
                  className="secondary-btn"
                  onClick={() => loadData()}
                  disabled={busy}
                >
                  <RefreshCw size={16} /> Refresh
                </button>
              }
            />

            {notifications.length ? (
              <div className="audit-list">
                {notifications.map(n => (
                  <div className="audit-item" key={n.id}>
                    <div>
                      <b>{n.title || 'Sunora notification'}</b>
                      <small>{String(n.event_type || '').replaceAll('_', ' ')}</small>
                      <p>{n.message || 'No additional details.'}</p>

                      {n.related_table && (
                        <small>
                          Related: {n.related_table}
                          {n.related_id ? ` · ${n.related_id}` : ''}
                        </small>
                      )}
                    </div>

                    <time>{new Date(n.created_at).toLocaleString()}</time>

                    <div>
                      {n.read_at ? (
                        <span className="status">Read</span>
                      ) : (
                        <>
                          <span className="status pending">Unread</span>
                          <button
                            className="mini-btn"
                            onClick={() => markNotificationRead(n.id)}
                          >
                            Mark as read
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text={isAdmin ? "No admin notifications yet." : "No notifications yet."} />
            )}
          </section>
        )}

        {/* ADMIN-ONLY MONTHLY REPORTS */}
        {tab === 'Monthly Reports' && isAdmin && (
          <section className="panel">
            <PanelHeading
              title="Monthly Reports"
              subtitle="Consolidated Sunora financial and partner performance report"
              action={
                <button className="secondary-btn" onClick={exportMonthlyReport}>
                  <Download size={16} /> Export sales CSV
                </button>
              }
            />

            <div className="report-toolbar">
              <label>
                <CalendarDays size={17} /> Report month
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
              </label>
              <span className="report-month-label">{monthLabel(reportMonth)}</span>
            </div>

            <div className="report-stats">
              <Stat icon={ReceiptText} label="Invoices" value={reportSales.length} foot="Invoice date in selected month" />
              <Stat icon={Users} label="Panels sold" value={reportSales.reduce((sum, s) => sum + Number(s.panel_quantity ?? s.quantity ?? 0), 0)} foot="Total panel quantity" />
              <Stat icon={TrendingUp} label="Sales in AED equivalent" value={money(reportTotalAED)} foot="Includes VAT · stored exchange rates" />
              <Stat icon={BadgePercent} label="Eligible profit records" value={eligibleCommissions.length} foot="Approved and project eligible" />
            </div>

            <div className="report-section">
              <PanelHeading title="Sales and VAT by currency" subtitle="Currencies are kept separate; AED equivalent is shown for comparison" />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Currency</th><th>Invoices</th><th>Panels</th><th>Subtotal ex VAT</th><th>VAT</th><th>Total incl. VAT</th><th>AED equivalent</th></tr>
                  </thead>
                  <tbody>
                    {salesByCurrency.map(x => (
                      <tr key={x.currency}>
                        <td><b>{x.currency}</b></td>
                        <td>{x.invoiceCount}</td>
                        <td>{x.panels}</td>
                        <td>{money(x.subtotal, x.currency)}</td>
                        <td>{money(x.vat, x.currency)}</td>
                        <td className="gold-text">{money(x.total, x.currency)}</td>
                        <td>{money(x.totalAED, 'AED')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!salesByCurrency.length && <Empty text="No sales found for this month." />}
              </div>
            </div>

            <div className="report-section">
              <PanelHeading title="Partner performance" subtitle="Monthly invoices, panels and sales value per partner" />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Partner</th><th>Partner ID</th><th>Invoices</th><th>Panels</th><th>Sales AED equivalent</th><th>Profit records</th><th>Eligible</th></tr>
                  </thead>
                  <tbody>
                    {partnerPerformance.map(x => (
                      <tr key={x.partner.id}>
                        <td><b>{x.partner.full_name}</b></td>
                        <td className="code">{x.partner.partner_code}</td>
                        <td>{x.invoices}</td>
                        <td>{x.panels}</td>
                        <td>{money(x.salesAED, 'AED')}</td>
                        <td>{x.commissionCount}</td>
                        <td>{x.eligibleCommissionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!partnerPerformance.length && <Empty text="No partner activity for this month." />}
              </div>
            </div>

            <div className="report-section">
              <PanelHeading title="Profit summary" subtitle="Approval and eligibility are separate checks" />
              <div className="report-stats three">
                <Stat icon={BadgePercent} label="Profit records" value={reportCommissions.length} foot="Created for selected-month invoices" />
                <Stat icon={CheckCircle2} label="Approved records" value={approvedCommissions.length} foot="Admin-approved profits" />
                <Stat icon={CircleAlert} label="Rejected records" value={rejectedCommissions.length} foot="Excluded from payable totals" />
              </div>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>Currency</th><th>Approved profit</th><th>Eligible profit</th></tr></thead>
                  <tbody>
                    {commissionTotalsByCurrency.map(x => (
                      <tr key={x.currency}>
                        <td><b>{x.currency}</b></td>
                        <td>{money(x.approved, x.currency)}</td>
                        <td className="gold-text">{money(x.eligible, x.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!commissionTotalsByCurrency.length && <Empty text="No profit records for this month." />}
              </div>
            </div>

            <div className="report-section">
              <PanelHeading title="Profit payments" subtitle="Payout records dated in the selected month" />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Currency</th><th>Paid</th><th>Pending</th></tr></thead>
                  <tbody>
                    {payoutTotalsByCurrency.map(x => (
                      <tr key={x.currency}>
                        <td><b>{x.currency}</b></td>
                        <td className="gold-text">{money(x.paid, x.currency)}</td>
                        <td>{money(x.pending, x.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!payoutTotalsByCurrency.length && <Empty text="No profit payments recorded in this month." />}
              </div>
            </div>

            <div className="report-section">
              <PanelHeading title="Additional project costs" subtitle="Cost entries linked to invoices dated in the selected month" />
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Invoice</th><th>Description</th><th>Currency</th><th>Amount</th><th>Notes</th></tr></thead>
                  <tbody>
                    {reportCosts.map(cost => {
                      const sale = sales.find(s => s.id === cost.sale_id);
                      return (
                        <tr key={cost.id}>
                          <td className="code">{sale?.invoice_number || '—'}</td>
                          <td>{cost.description}</td>
                          <td>{cost.currency}</td>
                          <td>{money(cost.amount, cost.currency)}</td>
                          <td>{cost.notes || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!reportCosts.length && <Empty text="No additional project costs for this month." />}
              </div>
            </div>

            <div className="form-hint report-note">
              Profit base is taken from the stored profit records and excludes VAT. Project costs are displayed separately and are not added again to the profit base. This report is read-only.
            </div>
          </section>
        )}

        {/* PARTNER-ONLY MONTHLY STATEMENT */}
        {tab === 'My Monthly Statement' && isPartner && (
          <section className="panel">
            <PanelHeading
              title="My Monthly Statement"
              subtitle="Your own invoices, profits and payment history"
              action={
                <div className="statement-actions">
                  <button className="secondary-btn" onClick={exportPartnerStatementPdf} disabled={!ownPartner}>
                    <Download size={16} /> Export PDF statement
                  </button>
                  <button className="secondary-btn" onClick={exportPartnerStatement} disabled={!ownPartner}>
                    <Download size={16} /> Export CSV
                  </button>
                </div>
              }
            />

            <div className="report-toolbar">
              <label>
                <CalendarDays size={17} /> Statement month
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
              </label>
              <span className="report-month-label">{monthLabel(reportMonth)}</span>
            </div>

            {!ownPartner ? (
              <div className="alert warning">
                <CircleAlert size={18} />
                Your partner profile is not linked to this login yet. Please ask Admin to link your portal account to your partner record.
              </div>
            ) : (
              <>
                <div className="statement-identity">
                  <div>
                    <span>PARTNER</span>
                    <h2>{ownPartner.full_name}</h2>
                    <b className="code">{ownPartner.partner_code}</b>
                  </div>
                  <span className="status">{ownPartner.status || 'active'}</span>
                </div>

                <div className="report-stats">
                  <Stat icon={ReceiptText} label="My invoices" value={statementSales.length} foot="Selected month" />
                  <Stat icon={Users} label="My panels" value={statementSales.reduce((sum, s) => sum + Number(s.panel_quantity ?? s.quantity ?? 0), 0)} foot="Panels invoiced" />
                  <Stat icon={BadgePercent} label="My profit records" value={statementCommissions.length} foot="Selected-month invoices" />
                  <Stat icon={CreditCard} label="My payouts" value={statementPayouts.filter(p => p.status === 'paid').length} foot="Paid payout records" />
                </div>

                <div className="report-section">
                  <PanelHeading title="My sales" subtitle="Only invoices belonging to your partner account" />
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Invoice</th><th>Date</th><th>Panels</th><th>Currency</th><th>Subtotal ex VAT</th><th>VAT</th><th>Total incl. VAT</th></tr></thead>
                      <tbody>
                        {statementSales.map(s => (
                          <tr key={s.id}>
                            <td className="code">{s.invoice_number}</td>
                            <td>{dateLabel(s.invoice_date)}</td>
                            <td>{s.panel_quantity ?? s.quantity}</td>
                            <td>{s.invoice_currency}</td>
                            <td>{money(s.subtotal_ex_vat, s.invoice_currency)}</td>
                            <td>{money(s.vat_amount, s.invoice_currency)}</td>
                            <td className="gold-text">{money(s.total_inc_vat ?? s.invoice_amount, s.invoice_currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!statementSales.length && <Empty text="No invoices for this month." />}
                  </div>
                </div>

                <div className="report-section">
                  <PanelHeading title="My profits" subtitle="Approval and project eligibility status for your invoices" />
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Invoice</th><th>Panels</th><th>Currency</th><th>Profit base</th><th>Rate</th><th>Profit</th><th>Approval</th><th>Eligibility</th></tr></thead>
                      <tbody>
                        {statementCommissions.map(c => (
                          <tr key={c.id}>
                            <td className="code">{c.sale?.invoice_number || '—'}</td>
                            <td>{c.panel_quantity}</td>
                            <td>{c.commission_currency}</td>
                            <td>{money(c.commissionable_base_amount, c.commission_currency)}</td>
                            <td>{c.commission_rate === null ? 'Pending' : `${c.commission_rate}%`}</td>
                            <td className="gold-text">{c.commission_amount === null ? 'Pending' : money(c.commission_amount, c.commission_currency)}</td>
                            <td><span className={`status ${c.approval_status === 'approved' ? '' : c.approval_status === 'rejected' ? 'inactive' : 'pending'}`}>{c.approval_status}</span>{c.approval_comments && <small>{c.approval_comments}</small>}</td>
                            <td><span className={`status ${c.eligibility_status === 'eligible' ? '' : 'inactive'}`}>{c.eligibility_status.replaceAll('_', ' ')}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!statementCommissions.length && <Empty text="No profit records for this month." />}
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Currency</th><th>Eligible profit</th><th>Paid</th><th>Pending</th><th>Outstanding (incl. pending)</th></tr></thead>
                      <tbody>
                        {statementCommissionTotals.map(x => (
                          <tr key={x.currency}>
                            <td><b>{x.currency}</b></td>
                            <td>{money(x.eligible, x.currency)}</td>
                            <td>{money(x.paid, x.currency)}</td>
                            <td>{money(x.pending, x.currency)}</td>
                            <td className="gold-text">{money(x.outstanding, x.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!statementCommissionTotals.length && <Empty text="No profit totals available." />}
                  </div>
                </div>

                <div className="report-section">
                  <PanelHeading title="My profit payment history" subtitle="Payouts linked to your own profit records" />
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Payment date</th><th>Amount</th><th>Currency</th><th>Status</th><th>Reference</th></tr></thead>
                      <tbody>
                        {statementPayouts.map(p => (
                          <tr key={p.id}>
                            <td>{dateLabel(p.payment_date || p.paid_at?.slice(0, 10))}</td>
                            <td className="gold-text">{money(p.amount, p.currency)}</td>
                            <td>{p.currency}</td>
                            <td><span className={`status ${p.status === 'paid' ? '' : 'pending'}`}>{p.status}</span></td>
                            <td>{p.payment_reference || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!statementPayouts.length && <Empty text="No profit payments recorded for this month." />}
                  </div>
                </div>

                <div className="form-hint report-note">
                  This is a read-only statement preview. Profit amounts are not payable until Admin approval and all project-completion checks are satisfied. Outstanding values are estimates based on the selected month's eligible profits and linked paid payouts.
                </div>
              </>
            )}
          </section>
        )}

        <footer className="footer">
          <span>© {new Date().getFullYear()} Sunora · Your Wellness Sun</span>
          <span><ShieldCheck size={14} /> Private company workspace</span>
        </footer>
      </main>

      {showPartner && (
        <Modal title="Register channel partner" close={() => setShowPartner(false)}>
          <form className="form-grid" onSubmit={addPartner}>
            <label>Full name *<input required value={partnerForm.full_name} onChange={e => setPartnerForm({ ...partnerForm, full_name: e.target.value })} placeholder="Partner full name" /></label>
            <label>Email address<input type="email" value={partnerForm.email} onChange={e => setPartnerForm({ ...partnerForm, email: e.target.value })} placeholder="partner@example.com" /></label>
            <label>Phone number<input value={partnerForm.phone} onChange={e => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="+971…" /></label>
            <label>Date of birth<input type="date" value={partnerForm.date_of_birth} onChange={e => setPartnerForm({ ...partnerForm, date_of_birth: e.target.value })} /></label>
            <label>Partner type
              <select value={partnerForm.partner_type} onChange={e => setPartnerForm({ ...partnerForm, partner_type: e.target.value })}>
                <option>Interior Designer</option><option>Sales Agent</option><option>Architect</option><option>Wellness Consultant</option><option>Other</option>
              </select>
            </label>
            <div className="full-field social-profile-fields">
              <div className="social-profile-heading"><b>Social media profiles</b><small>Select platforms and add the partner’s handle or profile URL.</small></div>
              {['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'YouTube', 'X', 'Website', 'Other'].map(platform => (
                <label className="social-profile-row" key={platform}>
                  <input type="checkbox" checked={Object.hasOwn(partnerForm.social_media_profiles || {}, platform)} onChange={e => setPartnerForm(f => { const profiles = { ...(f.social_media_profiles || {}) }; if (e.target.checked) profiles[platform] = ''; else delete profiles[platform]; return { ...f, social_media_profiles: profiles }; })} />
                  <span>{platform}</span>
                  {Object.hasOwn(partnerForm.social_media_profiles || {}, platform) && (
                    <input type="text" value={partnerForm.social_media_profiles[platform] || ''} placeholder="@username or profile URL" onChange={e => setPartnerForm(f => ({ ...f, social_media_profiles: { ...(f.social_media_profiles || {}), [platform]: e.target.value } }))} />
                  )}
                </label>
              ))}
            </div>
            <label>Referred by
              <select value={partnerForm.parent_partner_id} onChange={e => setPartnerForm({ ...partnerForm, parent_partner_id: e.target.value })}>
                <option value="">Direct registration (no parent)</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.partner_code} — {p.full_name}</option>)}
              </select>
            </label>
            <div className="form-hint"><ShieldCheck size={17} /> Partner ID is assigned automatically by the database when saved.</div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowPartner(false)}>Cancel</button>
              <button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Create partner'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showSale && (
        <Modal title="Create Sunora invoice" close={() => setShowSale(false)}>
          <form className="form-grid" onSubmit={addSale}>
            <label>Channel partner *
              <select required value={saleForm.partner_id} onChange={e => setSaleForm({ ...saleForm, partner_id: e.target.value, referral_id: '' })}>
                <option value="">Select partner</option>
                {(isStaff ? partners : scopedPartners).map(p => <option key={p.id} value={p.id}>{p.partner_code} — {p.full_name}</option>)}
              </select>
            </label>
            <label>Invoice number *<input required value={saleForm.invoice_number} onChange={e => setSaleForm({ ...saleForm, invoice_number: e.target.value })} placeholder="SUN-INV-1001" /></label>
            <label>Linked referral
              <select value={saleForm.referral_id} onChange={e => setSaleForm({ ...saleForm, referral_id: e.target.value })} disabled={!saleForm.partner_id}>
                <option value="">No referral selected</option>
                {referrals.filter(r => r.partner_id === saleForm.partner_id && r.status !== 'Lost').map(r => <option key={r.id} value={r.id}>{r.contact_name}{r.company ? ` — ${r.company}` : ''} (${r.status})</option>)}
              </select>
            </label>
            <label>Invoice date *<input required type="date" value={saleForm.invoice_date} onChange={e => setSaleForm({ ...saleForm, invoice_date: e.target.value })} /></label>
            <label>Customer country *
              <select required value={saleForm.country} onChange={e => setSaleForm({ ...saleForm, country: e.target.value })}>
                {['United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Oman', 'United Kingdom', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Invoice currency *
              <select value={saleForm.invoice_currency} onChange={e => updateSaleCurrency(e.target.value)}>
                <option value="AED">AED</option><option value="USD">USD</option>
              </select>
            </label>
            <label>Panel size *
              <select value={saleForm.panel_size} onChange={e => updatePanelSize(e.target.value)}>
                <option value="60x60">60 × 60</option><option value="40x120">40 × 120</option>
              </select>
            </label>
            <label>Panel quantity *<input required min="1" step="1" type="number" value={saleForm.quantity} onChange={e => setSaleForm({ ...saleForm, quantity: e.target.value })} /></label>
            <label>Unit price ({saleForm.invoice_currency}) *<input required min="0" step="0.01" type="number" value={saleForm.unit_price} onChange={e => setSaleForm({ ...saleForm, unit_price: e.target.value })} /></label>
            <label>Additional project cost description<input value={saleForm.additional_cost_description} onChange={e => setSaleForm({ ...saleForm, additional_cost_description: e.target.value })} placeholder="e.g. Metallic frame / special installation" /></label>
            <label>Additional project cost ({saleForm.invoice_currency})<input min="0" step="0.01" type="number" value={saleForm.additional_cost_amount} onChange={e => setSaleForm({ ...saleForm, additional_cost_amount: e.target.value })} /></label>
            <label>Legacy savings rate (%) *<input required min="0" max="100" type="number" step="0.01" value={saleForm.savings_rate} onChange={e => setSaleForm({ ...saleForm, savings_rate: e.target.value })} /></label>
            <label className="full-field">Notes<input value={saleForm.notes} onChange={e => setSaleForm({ ...saleForm, notes: e.target.value })} placeholder="Optional invoice / project notes" /></label>

            <div className="invoice-breakdown full-field">
              <div className="breakdown-heading"><Calculator size={17} /> Invoice calculation</div>
              <div><span>Panels ({invoiceQty} × {money(invoiceUnit, saleForm.invoice_currency)})</span><b>{money(panelSubtotal, saleForm.invoice_currency)}</b></div>
              <div><span>Additional project costs</span><b>{money(extraCost, saleForm.invoice_currency)}</b></div>
              <div><span>Subtotal excluding VAT</span><b>{money(invoiceSubtotal, saleForm.invoice_currency)}</b></div>
              <div><span>VAT (5%)</span><b>{money(vatAmount, saleForm.invoice_currency)}</b></div>
              <div className="breakdown-total"><span>Invoice total including VAT</span><b>{money(invoiceTotal, saleForm.invoice_currency)}</b></div>
              <div className="breakdown-commission"><span>Profit tier · {tier.label}</span><b>{estimatedCommission === null ? 'Manual rate required' : money(estimatedCommission, saleForm.invoice_currency)}</b></div>
              <small>Profit is calculated on the pre-VAT subtotal. VAT is excluded. Existing savings are kept separately in the legacy savings ledger.</small>
              {saleForm.invoice_currency === 'AED' && <small>USD base price conversion uses the fixed business rate: 1 USD = AED 3.68.</small>}
            </div>

            <div className="form-hint full-field">
              <Wallet size={17} /> Legacy savings estimate: <b>{money(invoiceTotal * Number(saleForm.savings_rate || 0) / 100, saleForm.invoice_currency)}</b>. This is separate from the new profit ledger.
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowSale(false)}>Cancel</button>
              <button className="primary-btn" disabled={busy || invoiceQty < 1 || invoiceUnit < 0 || extraCost < 0}>{busy ? 'Saving…' : 'Save invoice & profit'}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedRateCommission && (
        <Modal title="Approve manual profit rate" close={() => setSelectedRateCommission(null)}>
          <form className="form-grid" onSubmit={saveManualRate}>
            <div className="form-hint full-field">
              <b>{selectedRateCommission.sale?.invoice_number || 'Invoice'}</b> · {selectedRateCommission.panel_quantity} panels · Base {money(selectedRateCommission.commissionable_base_amount, selectedRateCommission.commission_currency)}. This rate requires Admin approval.
            </div>
            <label className="full-field">Profit rate (%) *
              <input required type="number" min="0" max="100" step="0.01" value={manualRate} onChange={e => setManualRate(e.target.value)} placeholder="Enter approved rate" />
            </label>
            <div className="form-hint full-field">
              Calculated profit: {money(Number(selectedRateCommission.commissionable_base_amount || 0) * Number(manualRate || 0) / 100, selectedRateCommission.commission_currency)}
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setSelectedRateCommission(null)}>Cancel</button>
              <button className="primary-btn" disabled={busy || manualRate === '' || Number(manualRate) < 0 || Number(manualRate) > 100}>{busy ? 'Saving…' : 'Approve rate'}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedCommission && (
        <Modal title={commissionDecision === 'approved' ? 'Approve profit' : 'Reject profit'} close={() => setSelectedCommission(null)}>
          <form className="form-grid" onSubmit={saveCommissionDecision}>
            <div className="form-hint full-field">
              <b>{selectedCommission.sale?.invoice_number || 'Invoice'}</b> · {selectedCommission.partner?.full_name || 'Partner'} · {selectedCommission.commission_amount === null ? 'Manual rate pending' : money(selectedCommission.commission_amount, selectedCommission.commission_currency)}
              <br />Approval does not itself make the profit payable. Project completion must be verified separately.
            </div>
            <label className="full-field">
              {commissionDecision === 'rejected' ? 'Rejection reason *' : 'Approval comments (optional)'}
              <textarea rows="4" value={approvalComments} onChange={e => setApprovalComments(e.target.value)} placeholder={commissionDecision === 'rejected' ? 'Explain why this profit is rejected…' : 'Optional approval note'} />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setSelectedCommission(null)}>Cancel</button>
              <button className="primary-btn" disabled={busy || (commissionDecision === 'rejected' && !approvalComments.trim())}>{busy ? 'Saving…' : commissionDecision === 'approved' ? 'Confirm approval' : 'Confirm rejection'}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedProject && (
        <Modal title={`Project completion · ${selectedProject.invoice_number || ''}`} close={() => setSelectedProject(null)}>
          <form className="form-grid" onSubmit={saveProjectReview}>
            <div className="form-hint full-field">All four checks must be confirmed before the linked approved profit can become eligible. Only Admin can change these checks.</div>
            {[
              ['final_client_payment_received', 'Final client payment received'],
              ['final_deliverables_submitted', 'Final deliverables submitted'],
              ['qc_passed', 'Quality control passed'],
              ['client_accepted', 'Client acceptance confirmed']
            ].map(([key, label]) => (
              <label className="completion-check full-field" key={key}>
                <input type="checkbox" checked={projectReview[key]} onChange={e => setProjectReview(v => ({ ...v, [key]: e.target.checked }))} />
                <span>{label}</span>
              </label>
            ))}
            <label className="full-field">Completion notes
              <textarea rows="4" value={projectReview.completion_comments} onChange={e => setProjectReview(v => ({ ...v, completion_comments: e.target.value }))} placeholder="Add QC, delivery or client acceptance notes…" />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setSelectedProject(null)}>Cancel</button>
              <button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Save project review'}</button>
            </div>
          </form>
        </Modal>
      )}

      {selectedPayout && (
        <Modal title="Confirm profit payout payment" close={() => setSelectedPayout(null)}>
          <form className="form-grid" onSubmit={markProfitPayoutPaid}>
            <div className="form-hint full-field">
              <b>{selectedPayout.invoice_number}</b> · {selectedPayout.partner_name} · {money(selectedPayout.amount, selectedPayout.currency)}
              <br />Only Admin can confirm this payout. The payment reference is required for the audit trail.
            </div>
            <label>Payment date *
              <input required type="date" value={payoutPaymentForm.payment_date} onChange={e => setPayoutPaymentForm(f => ({ ...f, payment_date: e.target.value }))} />
            </label>
            <label>Payment reference *
              <input required value={payoutPaymentForm.payment_reference} onChange={e => setPayoutPaymentForm(f => ({ ...f, payment_reference: e.target.value }))} placeholder="Bank transfer / receipt reference" />
            </label>
            <label className="full-field">Notes
              <textarea rows="3" value={payoutPaymentForm.notes} onChange={e => setPayoutPaymentForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional payment notes" />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setSelectedPayout(null)}>Cancel</button>
              <button className="primary-btn" disabled={busy || !payoutPaymentForm.payment_reference.trim()}>{busy ? 'Saving…' : 'Mark payout paid'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showPayment && (
        <Modal title="Record partner payment" close={() => setShowPayment(false)}>
          <form className="form-grid" onSubmit={addPayment}>
            <label className="full-field">Channel partner *
              <select required value={paymentForm.partner_id} onChange={e => setPaymentForm({ ...paymentForm, partner_id: e.target.value })}>
                <option value="">Select partner</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.partner_code} — {p.full_name}</option>)}
              </select>
            </label>
            <label>Amount (AED) *
              <input required min="0.01" step="0.01" type="number" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
            </label>
            <label>Payment date *
              <input required type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
            </label>
            <label>Payment reference
              <input value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="Transfer / receipt number" />
            </label>
            <label>Notes
              <input value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
            </label>
            <div className="form-hint"><CircleAlert size={17} /> This records a legacy savings payment, not a profit payment.</div>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowPayment(false)}>Cancel</button>
              <button className="primary-btn" disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="auth-page">
      <div className="setup-card">
        <img className="auth-logo" src="/sunora-logo.png" alt="Sunora" />
        <div className="eyebrow">INITIAL SETUP REQUIRED</div>
        <h1>Connect your Sunora workspace</h1>
        <p className="muted">The website is ready, but it needs your Supabase project URL and publishable/anon key before anyone can sign in.</p>
        <ol>
          <li>Open your Supabase project → <b>Project Settings → API</b>.</li>
          <li>Copy the Project URL and publishable/anon key.</li>
          <li>Create <code>.env.local</code> in the project root using <code>.env.example</code> as a guide.</li>
          <li>Run the SQL in <code>supabase/schema.sql</code> in Supabase SQL Editor.</li>
          <li>Restart the development server or redeploy to Vercel.</li>
        </ol>
        <div className="alert warning"><CircleAlert size={18} /> Never put a Supabase service-role key in frontend environment variables or commit secrets to GitHub.</div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, foot }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon"><Icon size={19} /></span>
      </div>
      <strong>{value}</strong>
      <small>{foot}</small>
    </div>
  );
}

function PanelHeading({ title, subtitle, action }) {
  return (
    <div className="panel-heading">
      <div><h3>{title}</h3><p>{subtitle}</p></div>
      {action}
    </div>
  );
}

function Toolbar({ search, setSearch, exportCsv }) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <Search size={17} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search records…" />
      </div>
      <button className="secondary-btn" onClick={exportCsv}><Download size={16} /> Export CSV</button>
    </div>
  );
}

function PartnersTable({ rows, onSelect, isAdmin, busy, onInvite }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Partner</th><th>Partner ID</th><th>Type</th><th>Parent partner</th><th>Joined</th><th>Status</th>{isAdmin && <th>Actions</th>}</tr></thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} onClick={() => onSelect(p)}>
              <td>
                <div className="person-cell">
                  <span className="person-avatar"><UserRound size={16} /></span>
                  <span><b>{p.full_name}</b><small>{p.email || p.phone || 'No contact added'}</small><small>{Object.entries(p.social_media_profiles || {}).filter(([,v]) => String(v || '').trim()).map(([k,v]) => `${k}: ${v}`).join(' · ') || 'No social profiles added'}</small></span>
                </div>
              </td>
              <td className="code">{p.partner_code}</td>
              <td>{p.partner_type || '—'}</td>
              <td>{p.parent?.full_name || 'Direct'}</td>
              <td>{dateLabel(p.created_at?.slice(0, 10))}</td>
              <td><span className={`status ${p.status === 'inactive' ? 'inactive' : ''}`}>{p.status || 'active'}</span></td>
              {isAdmin && <td onClick={e => e.stopPropagation()}>{p.user_id ? <span className="status">Login linked</span> : p.status === 'active' ? <button type="button" className="mini-btn" disabled={busy} onClick={e => { e.stopPropagation(); onInvite(p); }}>{busy ? 'Sending…' : 'Send invite'}</button> : '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty text="No channel partners found." />}
    </div>
  );
}

function SalesTable({ rows, empty = 'No invoices found.' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Invoice</th><th>Partner</th><th>Date</th><th>Quantity</th><th>Invoice amount</th><th>Savings</th></tr></thead>
        <tbody>
          {rows.map(s => (
            <tr key={s.id}>
              <td className="code">{s.invoice_number}</td>
              <td><b>{s.partner?.full_name || '—'}</b><small>{s.partner?.partner_code}</small></td>
              <td>{dateLabel(s.invoice_date)}</td>
              <td>{s.quantity}</td>
              <td>{money(s.invoice_amount, s.invoice_currency || 'AED')}</td>
              <td className="gold-text">{money(s.savings_amount, s.invoice_currency || 'AED')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty text={empty} />}
    </div>
  );
}

function Empty({ text }) {
  return <div className="empty-state"><FileSpreadsheet size={28} /><p>{text}</p></div>;
}

function Modal({ title, close, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <section className="modal">
        <header><h2>{title}</h2><button className="icon-btn" type="button" onClick={close}><X /></button></header>
        {children}
      </section>
    </div>
  );
}

function BranchNode({ partner, all, depth }) {
  const children = all.filter(p => p.parent_partner_id === partner.id);

  return (
    <div className="branch-node" style={{ marginLeft: Math.min(depth, 5) * 20 }}>
      <div className="branch-card">
        <span className="branch-avatar"><UserRound size={16} /></span>
        <div><b>{partner.full_name}</b><small className="code">{partner.partner_code} · {partner.partner_type || 'Partner'}</small></div>
        <span className="branch-child-count">{children.length} direct</span>
      </div>
      {children.map(c => <BranchNode key={c.id} partner={c} all={all} depth={depth + 1} />)}
    </div>
  );
}
