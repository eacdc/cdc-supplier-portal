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

/**
 * ~1,291 suppliers, one per ERP ledger, which is the real first-run number.
 *
 * The count is the point. A supplier list of five renders fine as a dropdown
 * and tells you nothing about whether the screen works; the search box, the
 * type-ahead on the confirmation screen and the merge pickers all only earn
 * their keep at this scale. The named ones at the front are the actual
 * neighbourhood a Print Sales quote lands in — they score close together once
 * corporate suffixes are stripped, and none of them but the first is right.
 */
const NAMED_SUPPLIERS = [
  { _id: 'g1', name: 'Siegwerk India Pvt Ltd', ledgerRefs: [{ site: 'KOL', ledgerId: 7375 }], aliases: ['SIEGWORK', 'Siegwerk India'], gstins: ['19AABCS1429B1ZP'] },
  { _id: 'g5', name: 'Print Sales Pvt Ltd', ledgerRefs: [{ site: 'KOL', ledgerId: 8812 }], aliases: [], gstins: ['19AACCP2856Q1ZR'] },
  { _id: 'g6', name: 'Graphic Sales', ledgerRefs: [{ site: 'KOL', ledgerId: 8813 }], aliases: [] },
  { _id: 'g7', name: 'India Sales Agency', ledgerRefs: [{ site: 'KOL', ledgerId: 8814 }], aliases: [] },
  { _id: 'g8', name: 'Print India Solution', ledgerRefs: [{ site: 'KOL', ledgerId: 8815 }], aliases: [] },
  { _id: 'g9', name: 'SR Graphic', ledgerRefs: [{ site: 'KOL', ledgerId: 8820 }, { site: 'AHM', ledgerId: 412 }], aliases: ['Neographic', 'Neographics'] },
  { _id: 'g4', name: 'CDC Printers (Ahmedabad)', ledgerRefs: [{ site: 'KOL', ledgerId: 9001 }], aliases: [], isInternal: true },
];

const FILLER = ['3S Graphic Solutions', 'A D Electrical Works', 'A G Engineering Works',
  'A K Pandey & Brothers', 'A K Sales Corporation', 'Bagla Polifilms Ltd', 'Kurz India Pvt Ltd'];

const SUPPLIERS = [
  ...NAMED_SUPPLIERS.map((s) => ({ aliases: [], gstins: [], isInternal: false, ...s })),
  ...Array.from({ length: 1284 }, (_, i) => ({
    _id: `x${i}`,
    name: `${FILLER[i % FILLER.length]}${i >= FILLER.length ? ` ${i}` : ''}`,
    ledgerRefs: [{ site: 'KOL', ledgerId: 6795 + i }],
    aliases: [],
    gstins: i % 3 ? [`19AAAAA${String(1000 + i).slice(0, 4)}A1Z${i % 10}`] : [],
    isInternal: false,
  })),
];

/** Board rates as they were actually printed on the two quotes. */
const BOARD_ROWS = [
  { lineId: 'b1', supplier: 'Sudarshan Paper & Board', productName: 'NIPPON GB PREMIUM', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '250', gsmTo: '500', banded: true, rate: '42.00', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b2', supplier: 'Sudarshan Paper & Board', productName: 'SIDHARTH NOVA GB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '250', gsmTo: '284', banded: true, rate: '48.00', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b3', supplier: 'AKT', productName: 'Devpriya PGB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: null, gsmTo: null, banded: false, rate: '48.25', uom: 'KG', supplyMode: 'MILL_ORDER', plant: 'KOLKATA' },
  { lineId: 'b4', supplier: 'AKT', productName: 'Devpriya PGB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: null, gsmTo: null, banded: false, rate: '48.75', uom: 'KG', supplyMode: 'EX_STOCK', plant: 'KOLKATA' },
  { lineId: 'b5', supplier: 'Sudarshan Paper & Board', productName: 'SIDHARTH CYBER GB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '250', gsmTo: '284', banded: true, rate: '49.00', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b6', supplier: 'AKT', productName: 'Devpriya Premium PGB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: null, gsmTo: null, banded: false, rate: '49.25', uom: 'KG', supplyMode: 'MILL_ORDER', plant: 'KOLKATA' },
  { lineId: 'b7', supplier: 'Sudarshan Paper & Board', productName: 'SIDHARTH CLASSIC GB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '250', gsmTo: '284', banded: true, rate: '51.00', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b8', supplier: 'Sudarshan Paper & Board', productName: 'MEHALI ECO GREEN LITE GB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '250', gsmTo: '284', banded: true, rate: '51.50', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b9', supplier: 'Sudarshan Paper & Board', productName: 'MEHALI ECO GREEN GB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '250', gsmTo: '284', banded: true, rate: '54.00', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b10', supplier: 'Sudarshan Paper & Board', productName: 'MEHALI ECO GREEN GB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '230', gsmTo: '249', banded: true, rate: '56.00', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b11', supplier: 'Sudarshan Paper & Board', productName: 'VISHAL ALPINE GB', grade: 'GREY_BACK', gradeLabel: 'Grey back', gsmFrom: '285', gsmTo: '319', banded: true, rate: '48.00', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b12', supplier: 'AKT', productName: 'Devpriya White Back', grade: 'WHITE_BACK', gradeLabel: 'White back', gsmFrom: null, gsmTo: null, banded: false, rate: '52.25', uom: 'KG', supplyMode: 'MILL_ORDER', plant: 'KOLKATA' },
  { lineId: 'b13', supplier: 'Sudarshan Paper & Board', productName: 'MEHALI ECO WHITE WB', grade: 'WHITE_BACK', gradeLabel: 'White back', gsmFrom: '250', gsmTo: '284', banded: true, rate: '57.50', uom: 'KG', plant: 'KOLKATA' },
  { lineId: 'b14', supplier: 'AKT', productName: 'TNPL FBB', grade: 'FBB', gradeLabel: 'FBB (folding box board)', gsmFrom: null, gsmTo: null, banded: false, rate: '74', uom: 'KG', supplyMode: 'MILL_ORDER', productForm: 'REEL', plant: 'KOLKATA' },
  { lineId: 'b15', supplier: 'AKT', productName: 'TNPL FBB', grade: 'FBB', gradeLabel: 'FBB (folding box board)', gsmFrom: null, gsmTo: null, banded: false, rate: '77.5', uom: 'KG', supplyMode: 'MILL_ORDER', productForm: 'SHEET', plant: 'KOLKATA' },
];

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
    evidence: 'Read "PRINT SALES PRIVATE LIMITED" from the document. Closest is Graphic Sales (61%) — too close to call, so pick the right supplier below',
    // The shortlist the scorer actually produces once "Pvt", "Ltd" and "India"
    // are stripped: three unrelated firms sharing one word, and no clear
    // winner. Exactly the case a person has to settle.
    candidates: [
      { supplierGroupId: 'g6', name: 'Graphic Sales', score: 0.61, matchedOn: 'Graphic Sales' },
      { supplierGroupId: 'g7', name: 'India Sales Agency', score: 0.58, matchedOn: 'India Sales Agency' },
      { supplierGroupId: 'g8', name: 'Print India Solution', score: 0.54, matchedOn: 'Print India Solution' },
    ],
    ledgerCandidates: [],
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

DOC_UNIDENTIFIED.materialClass = 'PAPER_BOARD';
DOC_UNIDENTIFIED.interpretation = {
  stage: 'NEEDS_INPUT',
  understanding: "Sudarshan's ex-stock price list for virgin board, addressed to CDC Kolkata, effective 11 August. Rates are per kilogram and every product is priced twice — RBD for sheets and RLS for reels, consistently Rs 3.00 apart. The list never states a paper type for any product.",
  notes: ['Applied the stated rule "sheet price 1.00 extra from reel price" to 4 rows.',
          'ASIA SYMBOL SILVER PAK is priced once with no form stated.'],
  questions: [
    { kind: 'PAPER_TYPE', brand: 'BOARDONE GC1', lineCount: 2, examples: ['APRILFINE BOARDONE GC1 HI-BULK RBD'] },
    { kind: 'PAPER_TYPE', brand: 'PRIMA FOLD', lineCount: 2, examples: ['CENTURY PRIMA FOLD RBD'] },
    { kind: 'PAPER_TYPE', brand: 'PRIMA PLUS', lineCount: 2, examples: ['CENTURY PRIMA PLUS RBD'] },
    { kind: 'PAPER_TYPE', brand: 'CYBER PREMIUM', lineCount: 2, examples: ['ITC CYBER PREMIUM RBD'] },
    { kind: 'PAPER_TYPE', brand: 'SAFIRE GRAPHIK', lineCount: 2, examples: ['ITC SAFIRE GRAPHIK RBD'] },
    { kind: 'PAPER_TYPE', brand: 'OMEGA PLUS', lineCount: 2, examples: ['CENTURY OMEGA PLUS RBD'] },
    { kind: 'PAPER_TYPE', brand: 'SILVERPACK', lineCount: 2, examples: ['APRILFINE SILVERPACK RBD'] },
    { kind: 'UNKNOWN_TERM', token: 'DIGIEDGE ABG', examples: ['SPB DIGIEDGE ABG'], question: 'What does "DIGIEDGE ABG" mean?' },
  ],
  rounds: 1, modelCalls: 1, answers: [],
};

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
  // The paper interpretation loop. DOC_UNIDENTIFIED stands in for Sudarshan's
  // virgin board list: read, but with seven brands whose type it cannot know.
  'GET /api/supplier-portal/paper/types': () => ([
    { canonical: 'MAPLITHO', label: 'Maplitho / uncoated' },
    { canonical: 'FBB', label: 'FBB (folding box board)' },
    { canonical: 'CBB', label: 'CBB (coated bleached board)' },
    { canonical: 'GREY_BACK', label: 'Grey back' },
    { canonical: 'WHITE_BACK', label: 'White back' },
    { canonical: 'GLOSS_ART', label: 'Gloss art' },
    { canonical: 'KRAFT', label: 'Kraft' },
  ]),
  'GET /api/supplier-portal/paper/brands': () => ([
    { brand: 'CARTE LUMINA', paperType: 'CBB', scope: 'GLOBAL' },
    { brand: 'PEARL XL PAC', paperType: 'FBB', scope: 'GLOBAL' },
  ]),
  'POST /api/supplier-portal/paper/d2/interpret': (body) => {
    const sent = JSON.parse(body || '{}');
    if ((sent.answers || []).length) {
      DOC_UNIDENTIFIED.interpretation = {
        ...DOC_UNIDENTIFIED.interpretation,
        stage: 'INTERPRETED', questions: [], rounds: 2, modelCalls: 1,
        understanding: DOC_UNIDENTIFIED.interpretation.understanding,
      };
      return { stage: 'INTERPRETED', questions: [], modelCalls: 0 };
    }
    return { stage: 'NEEDS_INPUT', questions: DOC_UNIDENTIFIED.interpretation.questions };
  },
  'GET /api/supplier-portal/quotes/d2': () => ({
    document: DOC_UNIDENTIFIED,
    supplierGroup: null,
    lines: QUOTE_LINES,
    pageUrls: [],
  }),
  // Real rows from two board quotes received the same day: Sudarshan's
  // machine-printed price list and AKT's photographed handwritten note.
  'GET /api/supplier-portal/boards/grades': () => ([
    { canonical: 'GREY_BACK', label: 'Grey back', rows: 12 },
    { canonical: 'WHITE_BACK', label: 'White back', rows: 5 },
    { canonical: 'FBB', label: 'FBB (folding box board)', rows: 3 },
    { canonical: 'CBB', label: 'CBB (coated bleached board)', rows: 1 },
    { canonical: 'SBS', label: 'SBS', rows: 0 },
    { canonical: 'KRAFT', label: 'Kraft', rows: 0 },
    { canonical: 'MAPLITHO', label: 'Maplitho', rows: 0 },
    { canonical: 'ART_PAPER', label: 'Art paper / art card', rows: 0 },
  ]),
  'GET /api/supplier-portal/boards/search': (_b, url) => {
    const gsm = Number(url.searchParams.get('gsm'));
    const grade = url.searchParams.get('grade') || '';
    const rows = BOARD_ROWS
      .filter((r) => !grade || r.grade === grade)
      .filter((r) => {
        if (!Number.isFinite(gsm)) return true;
        if (r.gsmFrom == null && r.gsmTo == null) return true;
        if (r.gsmFrom != null && gsm < Number(r.gsmFrom)) return false;
        if (r.gsmTo != null && gsm > Number(r.gsmTo)) return false;
        return true;
      })
      .sort((a, b) => Number(a.rate) - Number(b.rate));
    return { rows, quotes: 4 };
  },
  'GET /api/supplier-portal/suppliers': () => SUPPLIERS,
  'GET /api/supplier-portal/suppliers/search': (_body, url) => {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const pool = SUPPLIERS.filter((s) => !s.isInternal);
    if (!q) return pool.slice(0, 20);
    return pool
      .filter((s) => s.name.toLowerCase().includes(q)
        || (s.aliases || []).some((a) => a.toLowerCase().includes(q)))
      .slice(0, 20);
  },
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
  'POST /api/supplier-portal/suppliers/reconcile': () => (
    { assigned: 12, created: 1267, total: 1291, gstins: { updated: 1103, withGstin: 1140 } }
  ),
  'POST /api/supplier-portal/suppliers/refresh-history': () => ({ updated: 894, groups: 1275 }),
  'POST /api/supplier-portal/suppliers/merge': (body) => {
    const { sourceId } = JSON.parse(body || '{}');
    const i = SUPPLIERS.findIndex((s) => s._id === sourceId);
    const gone = i >= 0 ? SUPPLIERS.splice(i, 1)[0] : null;
    return { mergedInto: 'Print Sales Pvt Ltd', movedItems: 4, movedRates: 11, source: gone?.name };
  },
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
  if (handler) { let b=''; req.on('data',c=>b+=c); return req.on('end',()=>json(res, handler(b, url))); }
  return json(res, { error: `mock: no route for ${key}` }, 404);
}).listen(3001, () => console.log('mock API on 3001'));
