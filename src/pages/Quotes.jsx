/**
 * Quote documents: the list, and the upload flow.
 *
 * Upload asks for nothing. Who sent the quote, which plant it prices, when it
 * takes effect and on what terms are all printed on the document, and the
 * server reads them — the screen that used to ask made the uploader do the
 * extractor's job, from a dropdown of eighty supplier names with one wrong
 * choice enough to file a supplier's rates under another supplier's name.
 *
 * What the reviewer gets instead is a proposal with its evidence, on the review
 * screen, which they confirm in a glance.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { quotes, suppliers } from '../lib/api.js';
import { date, dateTime, truncate } from '../lib/format.js';
import DropZone from '../components/DropZone.jsx';
import {
  Button, DataTable, Empty, ErrorBox, SectionHeading, Select, Spinner, Tag, Verdict,
} from '../components/ui.jsx';

/** The words that have to be typed to delete everything. */
const PURGE_PHRASE = 'DELETE ALL QUOTES';

const STATUS_TONE = {
  APPROVED: 'OK',
  NEEDS_REVIEW: 'WARN',
  REJECTED: 'BLOCK',
};

export default function Quotes({ site }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, groupList] = await Promise.all([
        quotes.list({ status: status || undefined, limit: 100 }),
        suppliers.list(),
      ]);
      setRows(list.documents || []);
      setGroups(groupList || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load, site]);

  const groupName = (id) => groups.find((g) => String(g._id) === String(id))?.name || '—';

  const columns = [
    { key: 'uploadedAt', label: 'Uploaded', width: '130px', render: (r) => dateTime(r.uploadedAt) },
    {
      key: 'supplierGroupId',
      label: 'Supplier',
      width: '180px',
      render: (r) => {
        if (r.supplierGroupId) return groupName(r.supplierGroupId);
        // Not identified. Showing the name that WAS read beats "—": it is the
        // difference between "this needs a decision" and "this failed".
        const read = r.identification?.supplier?.readName;
        return read
          ? <span className="text-warn" title={r.identification?.supplier?.evidence}>{truncate(read, 26)} ?</span>
          : <span className="text-warn">not identified</span>;
      },
    },
    {
      key: 'originalFilename',
      label: 'Document',
      render: (r) => (
        <div>
          <span title={r.originalFilename}>{truncate(r.originalFilename || '(no filename)', 44)}</span>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <Tag>{r.docType}</Tag>
            {r.quoteStrength === 'SOFT' ? (
              <Tag title="Subject to change without notice">soft</Tag>
            ) : null}
            {r.isPartialUpdate ? (
              <Tag title="Restates only some lines of an earlier quote">partial re-quote</Tag>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'plantScope',
      label: 'Plant',
      width: '150px',
      render: (r) => (
        <span title={r.identification?.plant?.evidence || `Plant scope: ${r.plantScopeBasis}`}>
          {r.plantScope?.length ? r.plantScope.join(' + ') : <span className="text-warn">not identified</span>}
        </span>
      ),
    },
    {
      key: 'effectiveTo',
      label: 'Valid to',
      width: '150px',
      render: (r) => (
        <span title={`Basis: ${r.validityBasis}`}>
          {date(r.effectiveTo)}
          {r.validityBasis !== 'STATED' ? (
            <span className="ml-1 text-2xs text-slate-400">({r.validityBasis?.toLowerCase()})</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: '120px',
      render: (r) => <Verdict level={STATUS_TONE[r.status] || 'NEUTRAL'}>{r.status}</Verdict>,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SectionHeading>Quote documents</SectionHeading>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-auto w-44">
          <option value="">All statuses</option>
          <option value="UPLOADED">Uploaded</option>
          <option value="EXTRACTED">Extracted</option>
          <option value="NEEDS_REVIEW">Needs review</option>
          <option value="APPROVED">Approved</option>
          <option value="SUPERSEDED">Superseded</option>
          <option value="REJECTED">Rejected</option>
        </Select>
        <PurgeAll onDone={load} onError={setError} />
        <Button variant="primary" onClick={() => setShowUpload((s) => !s)}>
          {showUpload ? 'Close' : 'Upload a quote'}
        </Button>
      </div>

      {showUpload ? (
        <UploadPanel
          onUploaded={load}
          onDone={(id) => { setShowUpload(false); navigate(`/quotes/${id}`); }}
        />
      ) : null}

      <ErrorBox error={error} onRetry={load} />

      {loading ? <Spinner label="Loading quotes" /> : (
        <DataTable
          columns={columns}
          rows={rows}
          keyField="_id"
          onRowClick={(row) => navigate(`/quotes/${row._id}`)}
          empty={<Empty title="No quote documents yet." hint="Upload a supplier price list, email, or worksheet to start." />}
        />
      )}
    </div>
  );
}

/**
 * Upload.
 *
 * Drop the files and stop. Each one is uploaded, extracted and identified in
 * turn, and the panel reports what the server made of it — "Print Sales
 * Private Limited · Kolkata · 24 lines" — so a buyer who dropped six quotes
 * can see which ones need them and which do not.
 *
 * Files are processed one at a time on purpose. Extraction is the expensive
 * step, and six of them at once would race for the same rate limit and finish
 * in an order nobody can follow.
 *
 * Worksheets go straight to the server because the grid has to be parsed
 * there; everything else takes the presigned path so the file never passes
 * through the API process.
 */
function UploadPanel({ onUploaded, onDone }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  async function accept(files) {
    setBusy(true);
    const started = files.map((file) => ({
      name: file.name, state: 'WAITING', detail: 'Waiting…',
    }));
    setItems((prev) => [...prev, ...started]);
    const offset = items.length;

    for (let i = 0; i < files.length; i += 1) {
      const at = offset + i;
      const update = (patch) => setItems((prev) => prev.map((row, j) => (j === at ? { ...row, ...patch } : row)));
      try {
        const result = await uploadOne(files[i], update);
        update({ state: 'DONE', ...result });
      } catch (err) {
        update({ state: 'FAILED', detail: err.message, documentId: null });
      }
    }

    setBusy(false);
    onUploaded();
  }

  return (
    <div className="space-y-2">
      <DropZone onFiles={accept} disabled={busy} />

      {items.length ? (
        <ul className="divide-y divide-slate-100 border border-slate-200 bg-white">
          {items.map((item, i) => (
            <UploadRow key={`${item.name}-${i}`} item={item} onOpen={onDone} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const UPLOAD_TONE = {
  DONE: 'text-ok',
  FAILED: 'text-block',
  NEEDS_YOU: 'text-warn',
};

function UploadRow({ item, onOpen }) {
  const tone = UPLOAD_TONE[item.needsAttention?.length ? 'NEEDS_YOU' : item.state] || 'text-slate-500';
  return (
    <li className="flex items-baseline gap-2 px-2 py-1.5 text-xs">
      <span className="truncate font-medium text-slate-700" title={item.name}>
        {truncate(item.name, 40)}
      </span>
      <span className={`ml-auto text-right text-2xs ${tone}`}>{item.detail}</span>
      {item.documentId ? (
        <Button variant="ghost" onClick={() => onOpen(item.documentId)}>
          {item.needsAttention?.length ? 'confirm' : 'review'}
        </Button>
      ) : null}
    </li>
  );
}

/**
 * One file, all the way through.
 *
 * The returned detail is written for someone scanning a list of six, so it
 * leads with the answer — supplier, plant, line count — rather than with the
 * status of the job that produced it.
 */
async function uploadOne(file, update) {
  update({ state: 'WORKING', detail: 'Uploading and reading…' });

  const form = new FormData();
  form.append('file', file);

  const result = await quotes.upload(form);

  return {
    documentId: result.documentId,
    needsAttention: result.identification?.needsAttention || [],
    detail: describe(result),
  };
}

/** What the server made of a document, in one line. */
function describe(result) {
  const id = result.identification;
  const supplier = id?.supplier?.proposedName;
  const plants = id?.plant?.proposed || [];
  const needs = id?.needsAttention || [];

  const parts = [
    supplier || (needs.includes('supplier') ? 'supplier unclear' : null),
    plants.length ? plants.map(titleCase).join(' + ') : (needs.includes('plant') ? 'plant unclear' : null),
    typeof result.lineCount === 'number'
      ? `${result.lineCount} line${result.lineCount === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean);

  const summary = parts.join(' · ') || 'Read';
  return needs.length ? `${summary} — needs you` : summary;
}

function titleCase(text) {
  const t = String(text || '').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// The SHA-256 that used to be computed here now happens on the server, which
// has the bytes anyway. Hashing in the browser only made sense while the file
// went straight to storage and the API never saw it.

/**
 * Delete every quote, its lines and the rates it wrote.
 *
 * A starting-over button. It exists because starting over was otherwise a
 * hundred separate confirmations, and a hundred confirmations is not a
 * decision anybody makes carefully — it is one they click through.
 *
 * The phrase has to be typed rather than a second button pressed. Two clicks
 * in the same place is a rhythm; typing "DELETE ALL QUOTES" is not something
 * that happens while thinking about something else.
 *
 * Suppliers, the unit table and the item mappings are deliberately kept —
 * those are learned settings that survive a bad batch of extractions and are
 * tedious to rebuild. The stored files stay in R2, so the same documents can
 * be uploaded again rather than chased down from suppliers a second time.
 */
function PurgeAll({ onDone, onError }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);

  async function purge() {
    setWorking(true);
    try {
      const result = await quotes.purgeAll({ confirm: PURGE_PHRASE });
      setOpen(false);
      setTyped('');
      onDone();
      onError(null);
      // eslint-disable-next-line no-alert
      window.alert(
        `Deleted ${result.documents} quote${result.documents === 1 ? '' : 's'}, `
        + `${result.linesDeleted} line${result.linesDeleted === 1 ? '' : 's'} `
        + `and ${result.ratesDeleted} rate row${result.ratesDeleted === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      onError(err);
    } finally {
      setWorking(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)} title="Delete every quote and start again">
        delete all
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={PURGE_PHRASE}
        className="w-48 border border-warn-border px-1.5 py-1 text-2xs focus:outline-none focus:ring-1 focus:ring-warn"
      />
      <Button
        variant="danger"
        disabled={working || typed.trim().toUpperCase() !== PURGE_PHRASE}
        onClick={purge}
      >
        {working ? 'Deleting…' : 'Delete everything'}
      </Button>
      <Button variant="ghost" disabled={working} onClick={() => { setOpen(false); setTyped(''); }}>
        cancel
      </Button>
    </span>
  );
}
