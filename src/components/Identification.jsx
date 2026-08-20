/**
 * What the document said about itself, and the one click that settles it.
 *
 * This is the screen the upload flow exists for. The server has read the
 * sender, the addressee, the dates and the terms off the page; this shows each
 * one **with the evidence that produced it** — "matches Print Sales via the
 * signature block on page 3", "addressed to the Tangra street address" — so
 * confirming is a glance rather than a reopening of the PDF.
 *
 * Two rules shape the layout:
 *
 *  - **A confident reading is shown, not asked.** It renders as a statement
 *    with its evidence underneath, and the whole panel confirms with one
 *    button. Presenting a correct answer as a question wastes the reading.
 *  - **An unsure one is asked plainly, in place.** The field opens as a
 *    control, pre-loaded with the candidates the matcher found and their
 *    scores, and approval stays blocked until it is answered. There is no
 *    third state where the app half-guesses.
 */

import { useState } from 'react';
import { quotes } from '../lib/api.js';
import { date } from '../lib/format.js';
import { Button, ErrorBox, Tag } from './ui.jsx';

const PLANTS = ['KOLKATA', 'AHMEDABAD'];

export default function Identification({ doc, supplierGroup, groups = [], onChanged }) {
  const id = doc.identification || {};
  const needs = id.needsAttention || [];
  const settled = needs.length === 0;

  const [supplierChoice, setSupplierChoice] = useState('');
  const [plantChoice, setPlantChoice] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const locked = doc.status === 'APPROVED';

  async function run(action, fn) {
    setBusy(action);
    setError(null);
    try { await fn(); await onChanged(); } catch (err) { setError(err); } finally { setBusy(null); }
  }

  const confirm = () => run('confirm', () => quotes.confirm(doc._id, {
    ...(supplierChoice ? { supplierGroupId: supplierChoice } : {}),
    ...(plantChoice ? { plantScope: plantChoice } : {}),
  }));

  // Answered means: every unsettled field now has an answer in hand. Until
  // then the button would confirm nothing and is disabled saying so.
  const answered = (!needs.includes('supplier') || supplierChoice)
    && (!needs.includes('plant') || plantChoice?.length);

  return (
    <section
      className={`border bg-white ${settled ? 'border-slate-200' : 'border-warn-border'}`}
    >
      <header className={`flex flex-wrap items-baseline gap-2 border-b px-3 py-1.5 ${
        settled ? 'border-slate-200 bg-slate-50' : 'border-warn-border bg-warn-bg'
      }`}
      >
        <h2 className="text-xs font-semibold text-slate-700">Read from the document</h2>
        {settled ? (
          <span className="text-2xs text-slate-500">
            {id.status === 'CONFIRMED'
              ? `Confirmed by ${id.confirmedBy || 'a reviewer'}`
              : 'Nothing here needs you'}
          </span>
        ) : (
          <span className="text-2xs font-medium text-warn">
            {needs.length === 1
              ? `The ${needs[0]} could not be read with confidence — approval is blocked until you answer.`
              : 'The supplier and the plant could not be read with confidence — approval is blocked until you answer.'}
          </span>
        )}
        {id.status === 'CONFIRMED' && !locked ? (
          <Button
            className="ml-auto"
            variant="ghost"
            disabled={Boolean(busy)}
            onClick={() => run('reidentify', () => quotes.identify(doc._id))}
            title="Match against the supplier groups as they stand now. Does not re-read the document."
          >
            {busy === 'reidentify' ? 'Re-checking…' : 're-check'}
          </Button>
        ) : null}
      </header>

      <div className="grid gap-x-4 gap-y-3 px-3 py-2 md:grid-cols-2">
        <SupplierField
          id={id}
          supplierGroup={supplierGroup}
          groups={groups}
          asking={needs.includes('supplier') && !locked}
          value={supplierChoice}
          onChange={setSupplierChoice}
        />

        <PlantField
          id={id}
          doc={doc}
          asking={needs.includes('plant') && !locked}
          value={plantChoice}
          onChange={setPlantChoice}
        />

        <Reading
          label="Validity"
          value={
            <>
              {date(doc.effectiveFrom)} → {date(doc.effectiveTo)}
              {doc.validityBasis !== 'STATED' ? (
                <Tag title="The document stated no expiry; this one is the default validity, not the supplier's terms">
                  {String(doc.validityBasis || '').toLowerCase().replace('_', ' ')}
                </Tag>
              ) : null}
            </>
          }
          evidence={id.validity?.evidence}
          confidence={id.validity?.confidence}
        />

        <Reading
          label="Strength"
          value={
            <>
              {doc.quoteStrength === 'SOFT' ? 'Indicative' : 'Firm'}
              {doc.quoteStrength === 'SOFT' ? (
                <Tag title="A soft quote is a benchmark, and is never used as hard evidence against a PO">soft</Tag>
              ) : null}
            </>
          }
          evidence={id.strength?.evidence}
          confidence={id.strength?.confidence}
        />

        <Reading
          label="Terms"
          className="md:col-span-2"
          value={<TermsList terms={doc.commercialTerms} />}
          evidence={id.terms?.evidence}
          confidence={id.terms?.confidence}
        />
      </div>

      {error ? <div className="px-3 pb-2"><ErrorBox error={error} /></div> : null}

      {!settled && !locked ? (
        <footer className="flex items-center gap-2 border-t border-warn-border bg-warn-bg px-3 py-1.5">
          <Button variant="primary" disabled={Boolean(busy) || !answered} onClick={confirm}>
            {busy === 'confirm' ? 'Saving…' : 'Save and unblock'}
          </Button>
          <span className="text-2xs text-warn">
            {answered
              ? 'A name you corrected is kept as an alias, so this supplier’s next quote needs no correction.'
              : `Answer the ${needs.join(' and ')} above.`}
          </span>
        </footer>
      ) : null}

      {settled && id.status !== 'CONFIRMED' && !locked ? (
        <footer className="flex items-center gap-2 border-t border-slate-200 px-3 py-1.5">
          <Button variant="primary" disabled={Boolean(busy)} onClick={confirm}>
            {busy === 'confirm' ? 'Saving…' : 'Confirm'}
          </Button>
          <span className="text-2xs text-slate-500">
            Everything above was read off the document. Approval does not wait for this — confirming
            just records that someone looked.
          </span>
        </footer>
      ) : null}
    </section>
  );
}

function SupplierField({ id, supplierGroup, groups, asking, value, onChange }) {
  const read = id.supplier || {};

  if (!asking) {
    const corrected = read.basis === 'CORRECTED';
    return (
      <Reading
        label="Supplier"
        value={
          <>
            {supplierGroup?.name || read.proposedName || '—'}
            {corrected ? <Tag title="A reviewer picked this over what was read">corrected</Tag> : null}
          </>
        }
        /*
          A correction replaces the reading, so the reading's evidence and its
          confidence no longer describe what is shown — leaving "61% sure ·
          closest match is Print Solutions" above a name a person chose reads
          as though the app still disagrees. What stays useful is what the
          document literally said, which is why the correction was needed.
        */
        evidence={corrected ? readingNote(read) : read.evidence}
        confidence={corrected ? null : read.confidence}
      />
    );
  }

  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-slate-500">Supplier</p>
      {read.readName ? (
        <p className="mt-0.5 text-xs text-slate-700">
          The document says <span className="font-medium">“{read.readName}”</span>
          {read.foundIn ? <span className="text-slate-500"> ({read.foundIn})</span> : null}
          {read.readGstin ? <span className="text-slate-500"> · GSTIN {read.readGstin}</span> : null}
        </p>
      ) : null}

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-warn-border bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-warn"
      >
        <option value="">Which supplier is this?</option>
        {read.candidates?.length ? (
          <optgroup label="Closest matches">
            {read.candidates.map((c) => (
              <option key={c.supplierGroupId} value={c.supplierGroupId}>
                {c.name} — {Math.round((c.score || 0) * 100)}% on “{c.matchedOn}”
              </option>
            ))}
          </optgroup>
        ) : null}
        <optgroup label="All suppliers">
          {groups.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
        </optgroup>
      </select>

      <p className="mt-1 text-2xs text-slate-500">{sentence(read.evidence)}</p>

      {/*
        A supplier with an ERP ledger but no group is a first-time supplier, not
        a failure. Saying so points at the fix — create the group — instead of
        leaving a reviewer to scroll a list that cannot contain the answer. It
        sits below the evidence because it is the next step, not the finding.
      */}
      {read.ledgerCandidates?.length ? (
        <p className="mt-1 text-2xs text-slate-500">
          The ERP has a ledger for{' '}
          <span className="font-medium">{read.ledgerCandidates.map((l) => l.ledgerName).join(', ')}</span>
          {' '}but no supplier group. Create one on the Suppliers screen, then use re-check here.
        </p>
      ) : null}
    </div>
  );
}

function PlantField({ id, doc, asking, value, onChange }) {
  const read = id.plant || {};

  if (!asking) {
    const corrected = read.basis === 'CORRECTED';
    return (
      <Reading
        label="Plant"
        value={
          <>
            {(doc.plantScope?.length ? doc.plantScope : read.proposed || []).map(titleCase).join(' + ') || '—'}
            {read.unit ? <Tag title="The unit the address names. Both Tangra and Panchla are the Kolkata database.">{read.unit}</Tag> : null}
            {corrected ? <Tag title="A reviewer picked this over what was read">corrected</Tag> : null}
          </>
        }
        evidence={corrected
          ? (read.readAddress
            ? `Set by a reviewer. The document is addressed to “${read.readAddress}”.`
            : 'Set by a reviewer — the document named no plant.')
          : read.evidence}
        confidence={corrected ? null : read.confidence}
      />
    );
  }

  const chosen = value || [];
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-slate-500">Plant</p>
      {read.readAddress ? (
        <p className="mt-0.5 text-xs text-slate-700">
          Addressed to <span className="font-medium">“{read.readAddress}”</span>
        </p>
      ) : null}

      <div className="mt-1 flex gap-3">
        {PLANTS.map((plant) => (
          <label key={plant} className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={chosen.includes(plant)}
              onChange={() => onChange(
                chosen.includes(plant)
                  ? chosen.filter((p) => p !== plant)
                  : [...chosen, plant],
              )}
            />
            {titleCase(plant)}
          </label>
        ))}
      </div>

      <p className="mt-1 text-2xs text-slate-500">
        {sentence(read.evidence)}
        {' '}A quote covering both writes a separate rate per plant, at whatever each block says.
        Nothing is ever copied from one plant to the other.
      </p>
    </div>
  );
}

/** A settled reading: the answer, then how it was arrived at. */
function Reading({ label, value, evidence, confidence, className = '' }) {
  return (
    <div className={className}>
      <p className="text-2xs uppercase tracking-wide text-slate-500">
        {label}
        {typeof confidence === 'number' && confidence > 0 && confidence < 1 ? (
          <span className="ml-1 font-normal normal-case text-slate-400">
            {Math.round(confidence * 100)}% sure
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-800">{value}</p>
      {evidence ? <p className="mt-0.5 text-2xs text-slate-500">{evidence}</p> : null}
    </div>
  );
}

function TermsList({ terms }) {
  const rows = [
    ['Payment', terms?.paymentTerms],
    ['Credit', Number.isFinite(terms?.creditDays) ? `${terms.creditDays} days` : null],
    ['Freight', terms?.freightTerms],
    ['GST', terms?.gstNote],
    ['Insurance', terms?.insurance],
  ].filter(([, v]) => v);

  if (!rows.length) return <span className="text-slate-400">None stated</span>;

  return (
    <span className="flex flex-wrap gap-x-4 gap-y-0.5">
      {rows.map(([label, v]) => (
        <span key={label}>
          <span className="text-slate-500">{label}:</span> {v}
        </span>
      ))}
    </span>
  );
}

function titleCase(text) {
  const t = String(text || '').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** What the document literally said, for a supplier a reviewer corrected. */
function readingNote(read) {
  if (!read.readName) return 'Set by a reviewer — no supplier name could be read from the document.';
  const where = read.foundIn ? ` (${read.foundIn})` : '';
  const gstin = read.readGstin ? `, GSTIN ${read.readGstin}` : '';
  return `Set by a reviewer. The document says “${read.readName}”${where}${gstin}.`;
}

/**
 * Close a sentence that the server wrote without one.
 *
 * The evidence strings are phrases — "too close to call, confirm which
 * supplier this is" — and several of them are followed here by another
 * sentence. Without this the two run together into one unreadable line.
 */
function sentence(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  return /[.!?"'’)]$/.test(t) ? t : `${t}.`;
}
