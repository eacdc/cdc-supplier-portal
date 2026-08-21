/**
 * Quote review — source on the left, extracted table on the right, editable.
 *
 * Nothing enters rate history until a human approves here. That is the whole
 * design: extraction is fast and mostly right, and "mostly right" written
 * silently into a rate table is worse than slow, because a wrong rate stays
 * invisible until somebody buys against it.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { quotes, suppliers } from '../lib/api.js';
import { date, money, truncate } from '../lib/format.js';
import Identification from '../components/Identification.jsx';
import Interpretation from '../components/Interpretation.jsx';
import {
  Button, CheckRow, Empty, ErrorBox, Input, SectionHeading, Spinner, Tag, Verdict,
} from '../components/ui.jsx';

export default function QuoteReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The supplier list is needed only when the reading was not confident
      // enough, but fetching it alongside costs one round trip and saves the
      // reviewer a wait at exactly the moment they are already blocked.
      const [document, groupList] = await Promise.all([
        quotes.get(id),
        suppliers.list().catch(() => []),
      ]);
      setData(document);
      setGroups(groupList || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner label="Loading the document" />;
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Empty title="Document not found." />;

  const { document: doc, lines, supplierGroup, pageUrls } = data;
  const documentChecks = doc.checks || [];
  const lineChecks = lines.flatMap((l) => (l.checks || []).map((c) => ({ ...c, lineNo: l.lineNo })));
  const allChecks = [...documentChecks, ...lineChecks];
  const blocking = allChecks.filter((c) => !c.passed && c.severity === 'BLOCK');
  const warnings = allChecks.filter((c) => !c.passed && c.severity === 'WARN');
  const unansweredWarnings = warnings.filter((c) => !c.overrideReason && !overrides[c.code]);

  async function run(action, fn) {
    setBusy(action);
    setError(null);
    try { await fn(); await load(); } catch (err) { setError(err); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <Link to="/quotes" className="text-2xs text-slate-500 underline">← All quotes</Link>
        <h1 className="text-base font-semibold text-slate-900">
          {supplierGroup?.name
            || doc.identification?.supplier?.readName
            || doc.originalFilename
            || 'Untitled quote'}
        </h1>
        <Verdict level={doc.status === 'APPROVED' ? 'OK' : doc.status === 'NEEDS_REVIEW' ? 'WARN' : 'NEUTRAL'}>
          {doc.status}
        </Verdict>
        <Tag>{doc.docType}</Tag>
        {doc.quoteStrength === 'SOFT' ? <Tag title="Never used as hard evidence in a PO check">soft quote</Tag> : null}

        <div className="ml-auto">
          <DeleteQuote doc={doc} busy={busy} onDeleted={() => navigate('/quotes')} onError={setError} />
        </div>
      </div>

      {/*
        An extraction that failed leaves a document with no lines and no reason
        on the screen for why. The error is stored; showing it is the
        difference between "this is broken" and "this is broken because the
        provider was not configured, and here is the button to try again".
      */}
      {doc.extraction?.error ? (
        <div className="border border-block-border bg-block-bg px-3 py-2">
          <p className="text-xs font-semibold text-block">Extraction failed</p>
          <p className="mt-0.5 font-mono text-2xs text-block">{doc.extraction.error}</p>
          <p className="mt-1 text-2xs text-block">
            Nothing was written. Fix the cause, then use Re-run extraction below — or delete this
            and upload the file again.
          </p>
        </div>
      ) : null}

      {/*
        Paper and board are read as a conversation; every other material still
        takes the one-shot path. The panel decides its own prominence — full
        width once a document is being interpreted, one quiet line before that.
      */}
      <Interpretation doc={doc} onChanged={load} />

      <Identification
        doc={doc}
        supplierGroup={supplierGroup}
        groups={groups}
        onChanged={load}
      />

      {doc.nominatedPriceColumn || doc.derivationRules?.length || doc.cdcEntityScope !== 'ALL' ? (
        <DocumentSummary doc={doc} />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="lg:col-span-2">
          <SectionHeading>Source</SectionHeading>
          {pageUrls?.length ? (
            <div className="space-y-2">
              {pageUrls.map((url, i) => (
                /*
                  A PDF in an <img> renders as a broken image, and most of
                  CDC's quotes are PDFs. The browser's own viewer handles them,
                  so it gets the frame; only real images are shown as images.
                */
                /pdf/i.test(doc.mimeType || '') ? (
                  <object
                    key={url}
                    data={url}
                    type="application/pdf"
                    className="h-[70vh] w-full border border-slate-200"
                  >
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs underline">
                      Open {doc.originalFilename || 'the document'}
                    </a>
                  </object>
                ) : (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={url}
                      alt={`Page ${i + 1}`}
                      className="w-full border border-slate-200 object-contain"
                    />
                  </a>
                )
              ))}
            </div>
          ) : (
            <Empty
              title="No preview available."
              hint={doc.docType === 'WORKSHEET'
                ? 'Workbooks are parsed as a grid rather than rendered.'
                : 'The stored file could not be linked. The extracted lines below are unaffected.'}
            />
          )}
        </section>

        <section className="lg:col-span-3 space-y-2">
          <SectionHeading
            actions={
              <>
                <Button
                  onClick={() => run('extract', () => quotes.extract(id))}
                  disabled={Boolean(busy) || doc.status === 'APPROVED' || !doc.storageKey}
                  title="Read the stored file again from scratch. Replaces the lines below."
                >
                  {busy === 'extract' ? 'Re-reading…' : 'Re-run extraction'}
                </Button>
                <Button
                  onClick={() => run('match', () => quotes.match(id))}
                  disabled={Boolean(busy) || doc.status === 'APPROVED' || !doc.supplierGroupId}
                  title={doc.supplierGroupId
                    ? undefined
                    : 'Matching is scoped to what this supplier has supplied before, so it needs the supplier first.'}
                >
                  {busy === 'match' ? 'Matching…' : 'Run matching'}
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    Boolean(busy) || doc.status === 'APPROVED'
                    || blocking.length > 0 || unansweredWarnings.length > 0
                    // Nothing to write, and approving anyway would mark the
                    // document APPROVED and therefore undeletable.
                    || lines.length === 0
                  }
                  onClick={() => run('approve', () => quotes.approve(id, {
                    overrides: Object.entries(overrides).map(([code, reason]) => ({ code, reason })),
                  }))}
                >
                  {busy === 'approve' ? 'Approving…' : 'Approve and write rates'}
                </Button>
              </>
            }
          >
            Extracted lines ({lines.length})
          </SectionHeading>

          {/*
            The document names no unit anywhere, so every rate on it is
            unusable until somebody says what they are quoted in. It sits above
            the table rather than down in the checks list because it is the one
            action that unblocks the whole document.
          */}
          {documentChecks.some((c) => c.code === 'EXT012' && !c.passed) ? (
            <UnitPrompt
              doc={doc}
              busy={busy === 'uom'}
              onSet={(uom) => run('uom', () => quotes.setUom(id, uom))}
            />
          ) : null}

          {/*
            The approve button's own reason for being disabled, stated. A
            greyed-out button with no explanation is the most common way a
            review screen wastes somebody's afternoon.
          */}
          {lines.length === 0 ? (
            <p className="border border-block-border bg-block-bg px-2 py-1 text-2xs text-block">
              Nothing was extracted, so there is nothing to approve. Re-run extraction, or delete
              this and upload the file again.
            </p>
          ) : blocking.length ? (
            <p className="border border-block-border bg-block-bg px-2 py-1 text-2xs text-block">
              {blocking.length} blocking check{blocking.length === 1 ? '' : 's'} must be fixed before
              approval. These cannot be overridden.
            </p>
          ) : unansweredWarnings.length ? (
            <p className="border border-warn-border bg-warn-bg px-2 py-1 text-2xs text-warn">
              {unansweredWarnings.length} warning{unansweredWarnings.length === 1 ? '' : 's'} need a
              recorded reason before approval.
            </p>
          ) : doc.status === 'APPROVED' ? (
            <p className="border border-ok-border bg-ok-bg px-2 py-1 text-2xs text-ok">
              Approved on {date(doc.approvedAt)} by {doc.approvedBy}. Rate history has been written.
            </p>
          ) : null}

          <LineTable
            lines={lines}
            editing={editing}
            onEdit={setEditing}
            onSave={async (lineId, raw) => {
              await run('edit', () => quotes.editLine(id, lineId, { raw }));
              setEditing(null);
            }}
          />
        </section>
      </div>

      {allChecks.length ? (
        <section>
          <SectionHeading>Checks</SectionHeading>
          <ul className="space-y-1">
            {allChecks.map((check, i) => (
              <CheckRow
                key={`${check.code}-${check.lineNo ?? 'doc'}-${i}`}
                check={overrides[check.code] ? { ...check, overrideReason: overrides[check.code] } : check}
                onOverride={(code, reason) => setOverrides((prev) => ({ ...prev, [code]: reason }))}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Read an approved quote's file again, as a replacement that supersedes it.
 *
 * Deliberately two clicks. It is not destructive — the approved document and
 * its rates are untouched — but it does create a second document that somebody
 * then has to review and approve, and a stray click that silently adds work to
 * a queue is its own kind of damage.
 */
function RequoteFromFile({ doc, busy, onError }) {
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);
  const [working, setWorking] = useState(false);

  async function requote() {
    setWorking(true);
    try {
      const result = await quotes.requote(doc._id);
      navigate(`/quotes/${result.documentId}`);
    } catch (err) {
      onError(err);
      setArmed(false);
    } finally {
      setWorking(false);
    }
  }

  if (!armed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-2xs text-slate-400">approved — cannot be deleted</span>
        <Button
          variant="ghost"
          disabled={Boolean(busy)}
          onClick={() => setArmed(true)}
          title="Read the same file again with the current extractor. This document and its rates are not changed."
        >
          read this file again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" disabled={working} onClick={requote}>
        {working ? 'Reading…' : 'Yes, read it again'}
      </Button>
      <Button variant="ghost" disabled={working} onClick={() => setArmed(false)}>Cancel</Button>
      <span className="text-2xs text-slate-500">
        Creates a new quote from the same file. This one keeps its rates until you approve
        the new one, which then supersedes it.
      </span>
    </div>
  );
}

/**
 * Delete, with the confirmation in the button rather than in a dialog.
 *
 * Two clicks, the second one labelled with what it does. A modal for this
 * would be heavier than the action, and a bare `confirm()` is a sentence
 * nobody reads.
 *
 * An approved quote cannot be deleted at all — its rates are live. It offers
 * a re-read instead, which is the only way forward from there.
 */
function DeleteQuote({ doc, busy, onDeleted, onError }) {
  const [armed, setArmed] = useState(false);
  const [working, setWorking] = useState(false);

  /*
    An approved quote offers both, and they are different operations.

    Re-reading keeps the trail: a new document over the same stored file, which
    supersedes this one when approved and leaves this one untouched. Deleting
    removes this document and the rates it wrote — which is what somebody means
    when a batch of extractions was simply wrong and there is nothing worth
    superseding.

    "Cannot be deleted" on its own was a dead end: re-uploading the same file
    is caught as a duplicate of this very document, so an approved quote could
    neither be corrected nor removed.
  */
  const approved = doc.status === 'APPROVED';

  async function remove() {
    setWorking(true);
    try {
      await quotes.remove(doc._id, approved ? { force: true } : undefined);
      onDeleted();
    } catch (err) {
      onError(err);
      setArmed(false);
    } finally {
      setWorking(false);
    }
  }

  if (!armed) {
    return (
      <span className="inline-flex items-center gap-1">
        {approved ? <RequoteFromFile doc={doc} busy={busy} onError={onError} /> : null}
        <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setArmed(true)}>
          delete
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Button variant="danger" disabled={working} onClick={remove}>
        {working
          ? 'Deleting…'
          : (approved ? 'Delete this quote and its rates' : 'Delete this quote and its lines')}
      </Button>
      <Button variant="ghost" disabled={working} onClick={() => setArmed(false)}>cancel</Button>
      {approved ? (
        <span className="text-2xs text-warn">
          Its rates leave the comparison and the PO check. Re-upload the file to get them back.
        </span>
      ) : null}
    </span>
  );
}

/**
 * The handful of fields that are not part of identification.
 *
 * Shown only when one of them has something to say. Dates, plants, terms and
 * supplier all moved into the identification panel, where they sit beside the
 * evidence that produced them; what is left is worksheet and derivation
 * detail, which most documents do not have.
 */
function DocumentSummary({ doc }) {
  return (
    <div className="grid gap-2 border border-slate-200 bg-white px-3 py-2 text-xs md:grid-cols-3">
      {doc.cdcEntityScope !== 'ALL' ? (
        <Detail label="Entity scope">{doc.cdcEntityScope}</Detail>
      ) : null}
      {doc.nominatedPriceColumn ? (
        <Detail label="Price column">{doc.nominatedPriceColumn}</Detail>
      ) : null}
      {doc.derivationRules?.length ? (
        <Detail label="Stated rules">
          {doc.derivationRules.map((r, i) => (
            <span key={i} className="block text-2xs text-slate-500">{r.note}</span>
          ))}
        </Detail>
      ) : null}
    </div>
  );
}

function LineTable({ lines, editing, onEdit, onSave }) {
  if (!lines.length) {
    return <Empty title="No lines were extracted." hint="Check the source document, then re-run extraction." />;
  }

  return (
    <div className="overflow-x-auto border border-slate-200">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-2 py-1 text-left font-semibold text-slate-600" style={{ width: '32px' }}>#</th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600">Product</th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600" style={{ width: '110px' }}>Code</th>
            <th className="px-2 py-1 text-right font-semibold text-slate-600" style={{ width: '90px' }}>As quoted</th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600" style={{ width: '60px' }}>Unit</th>
            <th className="px-2 py-1 text-right font-semibold text-slate-600" style={{ width: '110px' }}>Normalised</th>
            <th className="px-2 py-1 text-left font-semibold text-slate-600" style={{ width: '110px' }}>Flags</th>
            <th className="px-2 py-1" style={{ width: '50px' }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const failing = (line.checks || []).filter((c) => !c.passed);
            const worst = failing.some((c) => c.severity === 'BLOCK') ? 'BLOCK'
              : failing.length ? 'WARN' : null;

            if (editing === line._id) {
              return <EditRow key={line._id} line={line} onCancel={() => onEdit(null)} onSave={onSave} />;
            }

            return (
              <tr
                key={line._id}
                className={`border-b border-slate-100 ${
                  worst === 'BLOCK' ? 'bg-block-bg' : worst === 'WARN' ? 'bg-warn-bg' : ''
                }`}
              >
                <td className="px-2 py-1 text-slate-400">{line.lineNo}</td>
                <td className="px-2 py-1">
                  <span title={line.raw?.productName}>{truncate(line.raw?.productName, 50)}</span>
                  {line.raw?.packSize ? (
                    <span className="ml-1 text-2xs text-slate-400">({line.raw.packSize})</span>
                  ) : null}
                  {/*
                    Paper and board. A board row's identity is its grade and
                    its GSM band, not its name — three rows of one quality
                    differ only by band, and without these shown they read as
                    the same product priced three different ways.
                  */}
                  <PaperSpec raw={line.raw} />
                </td>
                <td className="px-2 py-1 font-mono text-2xs">{line.raw?.productCode || '—'}</td>
                <td className="px-2 py-1 text-right tabular-nums">{line.raw?.rate || '—'}</td>
                <td className="px-2 py-1">
                  {line.raw?.uom
                    || (line.normalised?.uom
                      ? <span className="text-2xs text-slate-500" title="Not printed on the row — set for the whole document">{line.normalised.uom}*</span>
                      : <span className="text-warn">?</span>)}
                </td>
                <td className="px-2 py-1 text-right tabular-nums" title={line.normalised?.conversionNote}>
                  {line.normalised?.ratePerBaseUom
                    ? `${money(line.normalised.ratePerBaseUom)}`
                    : <span className="text-slate-400">—</span>}
                  {line.normalised?.uom ? (
                    <span className="ml-0.5 text-2xs text-slate-400">/{line.normalised.uom}</span>
                  ) : null}
                </td>
                <td className="px-2 py-1">
                  <div className="flex flex-wrap gap-0.5">
                    {(line.flags || []).map((flag) => (
                      <Tag key={flag} title={FLAG_HINTS[flag]}>{flag.replaceAll('_', ' ').toLowerCase()}</Tag>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-1">
                  <Button variant="ghost" onClick={() => onEdit(line._id)}>edit</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Editing supersedes the line rather than overwriting it, so what the document
 * actually said stays recoverable — otherwise a reviewer's correction and a
 * bad extraction look identical afterwards.
 */
function EditRow({ line, onCancel, onSave }) {
  const [raw, setRaw] = useState(line.raw || {});
  const field = (key) => (
    <Input
      value={raw[key] ?? ''}
      onChange={(e) => setRaw((prev) => ({ ...prev, [key]: e.target.value }))}
    />
  );

  return (
    <tr className="border-b border-slate-200 bg-slate-50">
      <td className="px-2 py-1 text-slate-400">{line.lineNo}</td>
      <td className="px-2 py-1">{field('productName')}</td>
      <td className="px-2 py-1">{field('productCode')}</td>
      <td className="px-2 py-1">{field('rate')}</td>
      <td className="px-2 py-1">{field('uom')}</td>
      <td className="px-2 py-1">{field('packSize')}</td>
      <td className="px-2 py-1 text-2xs text-slate-500">
        The original line is kept and superseded.
      </td>
      <td className="px-2 py-1">
        <div className="flex flex-col gap-1">
          <Button variant="primary" onClick={() => onSave(line._id, raw)}>save</Button>
          <Button variant="ghost" onClick={onCancel}>cancel</Button>
        </div>
      </td>
    </tr>
  );
}

const FLAG_HINTS = {
  PACK_SIZE_IN_NAME: 'A pack size was found inside the product name.',
  PACK_UOM_ASSUMED: 'A bare number was read as a pack size using the supplier default.',
  RATE_TREATED_AS_PER_PACK: 'The quoted figure was treated as the price of a whole pack.',
  UOM_FROM_DOCUMENT: 'The row printed no unit; this one was set for the whole document and the rate re-converted.',
  UOM_UNRESOLVED: 'The unit could not be resolved and needs a human.',
  NO_UOM_ON_LINE: 'This line stated no unit of its own.',
  WEB_LOOKUP_ELIGIBLE: 'Carries a brand or product code, so an online lookup would be meaningful.',
  HUMAN_CORRECTED: 'Corrected by a reviewer.',
};

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}

/**
 * Ask, once, what unit a document's rates are quoted in.
 *
 * Some price lists state it nowhere. A board quote heads its column
 * "RATE FOR 90 DAYS" over figures that are per tonne, and leaves the reader to
 * know that board is sold that way. Before this, each row failed on its own
 * and the screen showed nine identical blocking errors for one missing fact.
 *
 * The suggestions are ordered by what the document is likely to be rather than
 * alphabetically, and the rate column's own heading is quoted back — that
 * phrase is usually the only clue on the page, and a reviewer should not have
 * to reopen the PDF to see it.
 */
function UnitPrompt({ doc, busy, onSet }) {
  const [uom, setUom] = useState('');
  const suggestions = ['MT', 'KG', 'PC', 'LTR', 'SQM', 'REAM'];

  return (
    <section className="border border-block-border bg-block-bg px-2 py-1.5">
      <p className="text-xs font-semibold text-block">
        No unit is printed anywhere on this document.
      </p>
      <p className="mt-0.5 text-2xs text-block">
        {doc.rateBasisNote
          ? <>The rate column reads <span className="font-medium">“{doc.rateBasisNote}”</span>, which names no unit. </>
          : null}
        Rates cannot be compared until they are in a known unit. Paper and board are
        usually quoted per metric tonne.
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {suggestions.map((s) => (
          <Button key={s} disabled={busy} onClick={() => onSet(s)}>
            {busy && uom === s ? 'Applying…' : `per ${s}`}
          </Button>
        ))}
        <span className="text-2xs text-slate-500">or</span>
        <input
          value={uom}
          onChange={(e) => setUom(e.target.value)}
          placeholder="type a unit"
          className="w-28 border border-slate-300 px-1.5 py-1 text-xs focus:outline-none"
        />
        <Button variant="primary" disabled={busy || !uom.trim()} onClick={() => onSet(uom.trim())}>
          {busy ? 'Applying…' : 'Apply'}
        </Button>
      </div>

      <p className="mt-1 text-2xs text-slate-600">
        This fills in only the rows that print no unit of their own — a row that states
        one keeps it. Rates are re-converted, not just relabelled.
      </p>
    </section>
  );
}

/**
 * The specification of a paper or board line, under its name.
 *
 * Rendered only when the fields are present, which means only for paper
 * quotes: on an ink line every one of these is null and the row stays as it
 * was.
 */
function PaperSpec({ raw }) {
  if (!raw) return null;

  const band = raw.gsmFrom || raw.gsmTo
    ? `${raw.gsmFrom || '?'}–${raw.gsmTo || 'up'} gsm`
    : null;

  // Canonical types are stored underscored — GREY_BACK, MATTE_ART — because
  // that is what search matches on. Nobody should have to read them that way.
  const grade = raw.grade ? raw.grade.replace(/_/g, ' ').toLowerCase() : null;
  const shade = raw.shade ? raw.shade.toLowerCase() : null;

  const parts = [band, grade, shade, raw.bulk ? 'high bulk' : null, raw.mill]
    .filter(Boolean);
  if (!parts.length) return null;

  return (
    <span className="mt-0.5 block text-2xs text-slate-500">{parts.join(' · ')}</span>
  );
}
