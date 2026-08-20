/** Throwaway mock API, just enough to render every screen for a smoke test. */
import http from 'node:http';

const json = (res, body, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
};

const SESSION = {
  user: { id: 'u1', email: 'manu@cdcprinters.com', displayName: 'Manu', roles: ['ADMIN'], allowedSites: ['KOL','AHM'], defaultSite: 'KOL' },
  context: { site: 'KOL', erpUserId: 42, employeeLedgerId: 9879, warehouseId: 13 },
};

const ITEM_DETAIL = {
  item: { itemId: 3845, itemCode: 'INK-0042', name: 'UV Ink - Process-Cyan', groupId: 3, groupName: 'INK & ADDITIVES', subGroupId: null, subGroupName: null, stockUnit: 'KG', purchaseUnit: 'KG' },
  plant: 'KOLKATA',
  rankingMode: 'BRAND',
  lastPaid: { rate: 820, date: '2026-06-14', supplierName: 'Siegwerk India Pvt Ltd', voucherNo: 'PO02201_26_27' },
  quotes: [
    { supplierGroupId: 'g1', supplierName: 'Siegwerk', supplierProductName: 'SICURA PLAST 770 HS CYAN', state: 'QUOTED', rate: 810, uom: 'KG', plant: 'KOLKATA', effectiveTo: '2026-11-01', isExpired: false, quoteStrength: 'FIRM' },
    { supplierGroupId: 'g2', supplierName: 'Sakata', supplierProductName: 'SKT ENVIRO NEO CYAN', state: 'QUOTED', rate: 308, uom: 'KG', plant: 'KOLKATA', effectiveTo: '2026-09-15', isExpired: false, quoteStrength: 'SOFT' },
    { supplierGroupId: 'g3', supplierName: 'NR Agarwal', state: 'NOT_AT_PLANT', rate: null, quotedAtPlant: 'AHMEDABAD', displayNote: 'not quoted (Ahmedabad only)' },
  ],
  best: { supplierName: 'Siegwerk', rate: 810 },
  deltaVsLastPaid: { rupees: 10, percent: 1.22 },
  purchaseHistory: [
    { VoucherDate: '2026-04-02', VoucherNo: 'PO02100_26_27', LedgerName: 'Siegwerk India Pvt Ltd', PurchaseRate: 830, PurchaseOrderQuantity: 50, PurchaseUnit: 'KG' },
    { VoucherDate: '2026-06-14', VoucherNo: 'PO02201_26_27', LedgerName: 'Siegwerk India Pvt Ltd', PurchaseRate: 820, PurchaseOrderQuantity: 60, PurchaseUnit: 'KG' },
  ],
  sparkline: [
    { month: '2026-04', min: 820, max: 840, avg: 830, count: 2 },
    { month: '2026-05', min: 815, max: 835, avg: 825, count: 3 },
    { month: '2026-06', min: 810, max: 828, avg: 820, count: 2 },
  ],
  annualSpend: 4200000,
  purchaseCount: 18,
  ranking: {
    mode: 'BRAND',
    ranked: null,
    byBrand: [
      { brand: 'Siegwerk', quotes: [{ supplierGroupId: 'g1', supplierName: 'Siegwerk', supplierProductName: 'SICURA PLAST 770 HS CYAN', state: 'QUOTED', rate: 810, uom: 'KG', effectiveTo: '2026-11-01', quoteStrength: 'FIRM' }] },
      { brand: 'Sakata', quotes: [{ supplierGroupId: 'g2', supplierName: 'Sakata', supplierProductName: 'SKT ENVIRO NEO CYAN', state: 'QUOTED', rate: 308, uom: 'KG', effectiveTo: '2026-09-15', quoteStrength: 'SOFT' }] },
    ],
    crossBrandNote: 'Cross-brand prices are shown separately: substituting a brand is a technical decision, not a price decision.',
  },
};

/**
 * Two documents, taken from the real Print Sales quotation of 10-07-2026: one
 * as the identifier reads it when the supplier is already on file, and one as
 * it reads when they are not. The pair is the point — the confident case must
 * render as a statement and the unsure one as a question, and only seeing both
 * shows whether the screen actually does that.
 */
const IDENTIFIED = {
  status: 'PROPOSED',
  supplier: {
    proposedGroupId: 'g5', proposedName: 'Print Sales',
    readName: 'PRINT SALES PRIVATE LIMITED', readGstin: null,
    foundIn: 'signature block, page 3',
    confidence: 0.94,
    evidence: '"PRINT SALES PRIVATE LIMITED" (signature block, page 3) matches Print Sales via "Print Sales Private Limited" (94%)',
    candidates: [], ledgerCandidates: [], basis: 'READ',
  },
  plant: {
    proposed: ['KOLKATA'], unit: 'Tangra',
    readAddress: 'CDC PRINTERS (P). LTD. 45, Radhanath Chowdhuri Road, Kolkata - 700015',
    confidence: 0.95,
    evidence: 'Addressed to the Tangra street address — Kolkata',
    basis: 'READ',
  },
  validity: { confidence: 0.8, evidence: 'Effective 15 Jul 2026 from "QUOTATION w.e.f. 15-07-2026."; no expiry stated, so the default validity applies' },
  strength: { confidence: 0.9, evidence: 'Marked indicative: "The rate is subject to market fluctuation & availability of materials."' },
  terms: { confidence: 0.85, evidence: 'Read 3 terms from the document' },
  needsAttention: [],
};

const UNIDENTIFIED = {
  ...IDENTIFIED,
  supplier: {
    proposedGroupId: null, proposedName: null,
    readName: 'PRINT SALES PRIVATE LIMITED', readGstin: null,
    foundIn: 'signature block, page 3',
    confidence: 0.61,
    evidence: 'Closest match is Print Solutions (61%) — too close to call, confirm which supplier this is',
    candidates: [
      { supplierGroupId: 'g6', name: 'Print Solutions', score: 0.61, matchedOn: 'Print Solutions' },
      { supplierGroupId: 'g7', name: 'Sales Print India', score: 0.58, matchedOn: 'Sales Print' },
    ],
    ledgerCandidates: [{ ledgerId: 8812, ledgerName: 'PRINT SALES PVT LTD', gstin: null, score: 0.93 }],
    basis: 'READ',
  },
  plant: {
    proposed: [], unit: null, readAddress: null, confidence: 0,
    evidence: 'The document does not say which plant it is for — please confirm',
    basis: 'READ',
  },
  needsAttention: ['supplier', 'plant'],
};

const TERMS = {
  creditDays: null,
  paymentTerms: 'As per agreed terms.',
  freightTerms: 'Free to your work.',
  gstNote: 'GST will be charged extra as applicable',
  insurance: null,
};

const DOC_IDENTIFIED = {
  _id: 'd1', uploadedAt: '2026-08-19T10:00:00Z', supplierGroupId: 'g5',
  originalFilename: 'Print_Sales_10072026.pdf', docType: 'PRICE_LIST',
  mimeType: 'application/pdf', quoteStrength: 'SOFT',
  plantScope: ['KOLKATA'], plantScopeBasis: 'STATED',
  effectiveFrom: '2026-07-15', effectiveTo: '2026-09-28', validityBasis: 'DEFAULTED',
  cdcEntityScope: 'ALL', commercialTerms: TERMS,
  identification: IDENTIFIED, status: 'EXTRACTED', checks: [],
};

const DOC_UNIDENTIFIED = {
  ...DOC_IDENTIFIED,
  _id: 'd2', supplierGroupId: null, originalFilename: 'quote-scan-aug.pdf',
  plantScope: [], plantScopeBasis: 'ASSUMED',
  identification: UNIDENTIFIED, status: 'NEEDS_REVIEW',
  checks: [
    { code: 'EXT009', severity: 'BLOCK', scope: 'DOCUMENT', passed: false, message: UNIDENTIFIED.supplier.evidence, actualValue: 'PRINT SALES PRIVATE LIMITED', expectedValue: null },
    { code: 'EXT010', severity: 'BLOCK', scope: 'DOCUMENT', passed: false, message: UNIDENTIFIED.plant.evidence, actualValue: null, expectedValue: null },
  ],
};

/** A document whose extraction failed — exactly the state the user was stuck in. */
const DOC_FAILED = {
  ...DOC_IDENTIFIED,
  _id: 'd3', supplierGroupId: null, originalFilename: 'Print Sales 10-07-2026.pdf',
  plantScope: [], status: 'NEEDS_REVIEW',
  identification: UNIDENTIFIED,
  storageKey: 'supplier-portal/quotes/abc123.pdf',
  extraction: { error: 'Extraction provider "openai" is not registered. Available: none.', provider: null },
  checks: [
    { code: 'EXT009', severity: 'BLOCK', scope: 'DOCUMENT', passed: false, message: UNIDENTIFIED.supplier.evidence, actualValue: 'PRINT SALES PRIVATE LIMITED', expectedValue: null },
    { code: 'EXT010', severity: 'BLOCK', scope: 'DOCUMENT', passed: false, message: UNIDENTIFIED.plant.evidence, actualValue: null, expectedValue: null },
  ],
};

const QUOTE_LINES = [
  { _id: 'l1', lineNo: 1, raw: { productName: '790 x 1030 x 0.28mm', productCode: null, rate: '382.44', uom: 'PC', packSize: null }, normalised: { rate: 382.44, uom: 'PC', ratePerBaseUom: 382.44 }, flags: [], checks: [] },
  { _id: 'l2', lineNo: 2, raw: { productName: '576 x 889 x 0.28mm', productCode: null, rate: '240.67', uom: 'PC', packSize: null }, normalised: { rate: 240.67, uom: 'PC', ratePerBaseUom: 240.67 }, flags: [], checks: [] },
  { _id: 'l3', lineNo: 3, raw: { productName: 'RADICURE INTENSE 9000 PRO YELLOW', productCode: '120000201834', rate: '830.00', uom: 'KGS', packSize: null }, normalised: { rate: 830, uom: 'KG', ratePerBaseUom: 830 }, flags: [], checks: [] },
];

const ROUTES = {
  'POST /api/supplier-portal/auth/login': () => ({ token: 'mock-token', expiresAt: '2026-12-31', ...SESSION }),
  'GET /api/supplier-portal/auth/me': () => SESSION,
  'GET /api/supplier-portal/items/search': () => ({ plant: 'KOLKATA', site: 'KOL', results: [
    { ItemID: 3845, ItemCode: 'INK-0042', ItemName: 'UV Ink - Process-Cyan', ItemGroupName: 'INK & ADDITIVES', ItemSubGroupName: null, StockUnit: 'KG', PurchaseUnit: 'KG', matchedVia: 'SUPPLIER_NAME' },
    { ItemID: 4102, ItemCode: 'INK-0088', ItemName: 'INK, Maplitho - Process Ink-Black', ItemGroupName: 'INK & ADDITIVES', ItemSubGroupName: null, StockUnit: 'KG', PurchaseUnit: 'KG', matchedVia: 'CDC_NAME' },
  ] }),
  'GET /api/supplier-portal/items/3845': () => ITEM_DETAIL,
  'GET /api/supplier-portal/mappings/queue': () => ({ site: 'KOL', total: 2, entries: [{
    _id: 'q1', reason: 'AMBIGUOUS', site: 'KOL', priority: 1250000, status: 'OPEN',
    supplierGroup: { _id: 'g1', name: 'Ultimate Logistix' },
    document: { _id: 'd1', originalFilename: 'ultimate-aug.pdf', docType: 'PRICE_LIST', effectiveFrom: '2026-08-01' },
    line: { _id: 'l1', lineNo: 4, raw: { productName: 'G.I WIRE SPOOL BIG 26', productCode: null, packSize: '15 kg Spool', uom: 'KG', rate: '149.00', text: 'G.I WIRE SPOOL BIG 26 (15 kg Spool) | 149.00/KG' }, normalised: { rate: 149, uom: 'KG', ratePerBaseUom: 149, packQty: 15, packUom: 'KG', conversionNote: '149 per KG; pack of 15 KG = 2235 per Nos' } },
    candidates: [
      { itemId: 5501, itemName: 'G.I WIRE SPOOL BIG 26', itemCode: 'OM-5501', subGroupName: 'Binding Materials', lastPaidRate: 2235, lastSupplier: 'Ultimate Logistix', purchaseCount: 12, score: 0.94, rationale: 'within 0.0% of last paid; this supplier supplies it' },
      { itemId: 5502, itemName: 'G.I WIRE SPOOL SMALL 24', itemCode: 'OM-5502', subGroupName: 'Binding Materials', lastPaidRate: 1800, lastSupplier: 'Trilochan', purchaseCount: 3, score: 0.62, rationale: 'name similarity 0.71' },
    ],
  }] }),
  'GET /api/supplier-portal/mappings/queue-stats': () => ({ site: 'KOL', openCount: 546, openSpend: 38500000, byStatus: [] }),
  'GET /api/supplier-portal/quotes': () => ({ total: 2, documents: [DOC_IDENTIFIED, DOC_UNIDENTIFIED] }),
  'GET /api/supplier-portal/quotes/d1': () => ({
    document: DOC_IDENTIFIED,
    supplierGroup: { _id: 'g5', name: 'Print Sales' },
    lines: QUOTE_LINES,
    pageUrls: [],
  }),
  'GET /api/supplier-portal/quotes/d3': () => ({
    document: DOC_FAILED,
    supplierGroup: null,
    lines: [],
    pageUrls: [],
  }),
  'GET /api/supplier-portal/quotes/d2': () => ({
    document: DOC_UNIDENTIFIED,
    supplierGroup: null,
    lines: QUOTE_LINES,
    pageUrls: [],
  }),
  'GET /api/supplier-portal/suppliers': () => ([
    { _id: 'g1', name: 'Siegwerk', ledgerRefs: [{ site: 'KOL', ledgerId: 7375 }], aliases: ['SIEGWORK','Siegwerk India'], tradesAs: [], isInternal: false },
    { _id: 'g5', name: 'Print Sales', ledgerRefs: [{ site: 'KOL', ledgerId: 8812 }], aliases: [], tradesAs: [], isInternal: false },
    { _id: 'g6', name: 'Print Solutions', ledgerRefs: [], aliases: [], tradesAs: [], isInternal: false },
    { _id: 'g7', name: 'Sales Print India', ledgerRefs: [], aliases: [], tradesAs: [], isInternal: false },
    { _id: 'g4', name: 'CDC Printers (Ahmedabad)', ledgerRefs: [{ site: 'KOL', ledgerId: 9001 }], aliases: [], isInternal: true },
  ]),
  'GET /api/supplier-portal/reports/leakage': () => ({ plant: 'KOLKATA', totalLeakage: 1842000, poCount: 96, window: { from: '2026-05-20', to: '2026-08-20' }, lines: [
    { poVoucherNo: 'PO02359_26_27', poDate: '2026-08-18', itemId: 3845, itemName: 'UV Ink - Process-Cyan', supplierName: 'Siegwerk', poRate: 860, bestRate: 810, bestSupplier: 'Siegwerk', quantity: 500, perUnitDelta: 50, leakage: 25000, plant: 'KOLKATA' },
  ] }),
  'GET /api/supplier-portal/po-check/sweep': () => ({ window: { from: '2026-08-19', to: '2026-08-20' }, plant: 'KOLKATA', checked: 14, needingAttention: 1, results: [{
    poTransactionId: 58682, poVoucherNo: 'PO02359_26_27', poDate: '2026-08-18', supplierName: 'Siegwerk India Pvt Ltd', plant: 'KOLKATA',
    verdict: { level: 'BLOCK', summary: 'PO rate ₹860 is 6.2% above Siegwerk\'s own quote of ₹810', blocking: 1, warnings: 1 },
    lines: [{ transactionDetailId: 1, itemId: 3845, itemName: 'UV Ink - Process-Cyan', quantity: 500, uom: 'KG', poRate: 860, bestQuote: { rate: 810, supplier: 'Siegwerk' }, lastPaid: { rate: 820 }, plant: 'KOLKATA', verdict: { level: 'BLOCK' }, checks: [
      { code: 'PO002', severity: 'BLOCK', passed: false, message: "PO rate ₹860 is 6.2% above Siegwerk's own quote of ₹810", actualValue: 860, expectedValue: 810 },
      { code: 'PO006', severity: 'WARN', passed: false, message: 'PO rate ₹860 differs from last paid ₹820 by 4.9%', actualValue: 860, expectedValue: 820 },
    ] }],
  }] }),
  'GET /api/supplier-portal/receiving/document-sets': () => ({ total: 0, documentSets: [] }),
  // 1,279 unplaced ledgers, the real first-run number, so the cap and the bulk
  // action are exercised rather than assumed.
  'POST /api/supplier-portal/suppliers/reconcile': (body) => {
    const sent = body ? JSON.parse(body) : {};
    if (sent.autoCreate) return { assigned: 12, created: 1267, unmatched: [], gstins: { updated: 1103 } };
    return {
      assigned: 0, created: 0, gstins: { updated: 0 },
      unmatched: Array.from({ length: 1279 }, (_, i) => ({
        ledgerId: 6795 + i,
        ledgerName: ['3S Graphic Solutions','A D Electrical Works','A G Engineering Works','A K Pandey & Brothers','A K Sales Corporation'][i % 5] + (i > 4 ? ` ${i}` : ''),
        suggestion: i % 7 === 0 ? { groupId: 'g1', name: 'Siegwerk', score: 0.52 } : null,
      })),
    };
  },
  'POST /api/supplier-portal/suppliers/refresh-history': () => ({ updated: 894, groups: 1275 }),
  'POST /api/supplier-portal/quotes/d3/extract': () => {
    DOC_FAILED.extraction = { error: null, provider: 'openai', model: 'gpt-4o' };
    DOC_FAILED.status = 'EXTRACTED';
    DOC_FAILED.identification = IDENTIFIED;
    DOC_FAILED.supplierGroupId = 'g5';
    return { lineCount: 3, checks: [], identification: IDENTIFIED };
  },
  'DELETE /api/supplier-portal/quotes/d3': () => ({ deleted: true, linesDeleted: 0 }),
  // Confirming mutates the mock in place so the screen actually changes —
  // a stub that returns 200 and leaves the page identical proves nothing.
  'PATCH /api/supplier-portal/quotes/d2/identification': (body) => {
    const sent = body ? JSON.parse(body) : {};
    if (sent.supplierGroupId) {
      DOC_UNIDENTIFIED.supplierGroupId = sent.supplierGroupId;
      UNIDENTIFIED.supplier = { ...UNIDENTIFIED.supplier, proposedName: 'Print Sales', basis: 'CORRECTED' };
    }
    if (sent.plantScope?.length) {
      DOC_UNIDENTIFIED.plantScope = sent.plantScope;
      UNIDENTIFIED.plant = { ...UNIDENTIFIED.plant, proposed: sent.plantScope, basis: 'CORRECTED' };
    }
    UNIDENTIFIED.needsAttention = [
      ...(DOC_UNIDENTIFIED.supplierGroupId ? [] : ['supplier']),
      ...(DOC_UNIDENTIFIED.plantScope.length ? [] : ['plant']),
    ];
    UNIDENTIFIED.status = UNIDENTIFIED.needsAttention.length ? 'PROPOSED' : 'CONFIRMED';
    UNIDENTIFIED.confirmedBy = 'manu@cdcprinters.com';
    DOC_UNIDENTIFIED.checks = DOC_UNIDENTIFIED.checks.map((c) => ({
      ...c,
      passed: !UNIDENTIFIED.needsAttention.includes(c.code === 'EXT009' ? 'supplier' : 'plant'),
    }));
    if (!UNIDENTIFIED.needsAttention.length) DOC_UNIDENTIFIED.status = 'EXTRACTED';
    return { document: DOC_UNIDENTIFIED, checks: DOC_UNIDENTIFIED.checks };
  },
  'PATCH /api/supplier-portal/quotes/d1/identification': () => {
    IDENTIFIED.status = 'CONFIRMED';
    IDENTIFIED.confirmedBy = 'manu@cdcprinters.com';
    IDENTIFIED.supplier.basis = 'CONFIRMED';
    IDENTIFIED.plant.basis = 'CONFIRMED';
    return { document: DOC_IDENTIFIED, checks: [] };
  },
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
  const url = new URL(req.url, 'http://x');
  const key = `${req.method} ${url.pathname}`;
  const handler = ROUTES[key];
  if (handler) { let b=''; req.on('data',c=>b+=c); return req.on('end',()=>json(res, handler(b))); }
  return json(res, { error: `mock: no route for ${key}` }, 404);
}).listen(3001, () => console.log('mock API on 3001'));
