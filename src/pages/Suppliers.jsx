/**
 * Suppliers.
 *
 * One supplier per ERP ledger, created by Sync. There is no grouping step and
 * no placement queue: the screen that used to live here asked a buyer to sort
 * 1,279 ledgers into eight groups through 1,279 dropdowns, which is not a task
 * anybody was going to finish.
 *
 * Suppliers are independent by default and merged when somebody notices two
 * are the same firm. That ordering matters — merging on discovery costs
 * seconds, whereas pre-sorting costs a week and has to be done before any
 * quote can be uploaded at all.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { suppliers } from '../lib/api.js';
import { siteLabel } from '../lib/format.js';
import {
  Button, DataTable, Empty, ErrorBox, Field, Input, SearchInput,
  SectionHeading, Spinner, Tag,
} from '../components/ui.jsx';

export default function Suppliers({ site }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [creating, setCreating] = useState(false);
  const [merging, setMerging] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await suppliers.list());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, site]);

  async function run(key, fn, describe) {
    setBusy(key);
    setError(null);
    setNote(null);
    try {
      setNote(describe(await fn()));
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const sync = () => run('sync', suppliers.sync, (r) => (
    `${plural(r.created, 'new supplier')} from ${r.total} ERP ledger${r.total === 1 ? '' : 's'}`
    + `, ${plural(r.assigned, 'ledger')} joined to a supplier already on file`
    + `, and ${plural(r.gstins?.updated ?? 0, 'GSTIN')} stored.`
  ));

  /**
   * Populate the item groups each supplier has historically supplied.
   *
   * Tier 0 of the matcher narrows candidates to these, and it is what keeps an
   * ink supplier's quote away from shipper cartons. Without it every quote
   * line is matched against the whole item master.
   */
  const refreshHistory = () => run('history', suppliers.refreshHistory, (r) => (
    `Read purchase history for ${r.updated} of ${r.groups} suppliers. `
    + 'Matching will now narrow to what each supplier actually sells.'
  ));

  // Filtering happens here rather than on the server: the whole list is
  // already loaded, and a round trip per keystroke would be slower than the
  // filter it is replacing.
  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((r) => (
      r.name.toLowerCase().includes(text)
      || (r.aliases || []).some((a) => a.toLowerCase().includes(text))
      || (r.gstins || []).some((g) => g.toLowerCase().includes(text))
      || (r.ledgerRefs || []).some((l) => String(l.ledgerId) === text)
    ));
  }, [rows, q]);

  const columns = [
    { key: 'name', label: 'Supplier', width: '220px' },
    {
      key: 'ledgerRefs',
      label: `Ledgers at ${siteLabel(site)}`,
      width: '150px',
      render: (r) => {
        const here = (r.ledgerRefs || []).filter((l) => l.site === site);
        // A supplier with no ledger at this site is normal, not a fault — it
        // trades at the other plant, or it is a trader with no ledger at all.
        if (!here.length) return <span className="text-2xs text-slate-400">—</span>;
        return <span className="font-mono text-2xs">{here.map((l) => l.ledgerId).join(', ')}</span>;
      },
    },
    {
      key: 'sites',
      label: 'Plants',
      width: '110px',
      render: (r) => {
        const seen = [...new Set((r.ledgerRefs || []).map((l) => l.site))];
        return (
          <div className="flex flex-wrap gap-1">
            {seen.map((s) => <Tag key={s}>{siteLabel(s)}</Tag>)}
          </div>
        );
      },
    },
    {
      key: 'aliases',
      label: 'Also known as',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.aliases || []).map((a) => <Tag key={a}>{a}</Tag>)}
        </div>
      ),
    },
    {
      key: 'gstins',
      label: 'GSTIN',
      width: '160px',
      render: (r) => (
        <span className="font-mono text-2xs text-slate-500">
          {(r.gstins || []).join(' ') || '—'}
        </span>
      ),
    },
    {
      key: 'isInternal',
      label: '',
      width: '130px',
      render: (r) => (r.isInternal
        ? <Tag title="An inter-unit transfer, not a purchase — excluded from every benchmark">internal transfer</Tag>
        : null),
    },
  ];

  return (
    <div className="space-y-3">
      <SectionHeading
        actions={
          <>
            <Button
              onClick={sync}
              disabled={Boolean(busy)}
              title="Create a supplier for every ERP supplier ledger that does not have one, and store their GSTINs."
            >
              {busy === 'sync' ? 'Syncing…' : 'Sync from ERP'}
            </Button>
            <Button
              onClick={refreshHistory}
              disabled={Boolean(busy)}
              title="Read what each supplier has actually supplied, so matching narrows to those item groups."
            >
              {busy === 'history' ? 'Reading history…' : 'Refresh purchase history'}
            </Button>
            <Button onClick={() => { setMerging((m) => !m); setCreating(false); }}>
              {merging ? 'Close' : 'Merge two'}
            </Button>
            <Button variant="primary" onClick={() => { setCreating((c) => !c); setMerging(false); }}>
              {creating ? 'Close' : 'Add supplier'}
            </Button>
          </>
        }
      >
        Suppliers
      </SectionHeading>

      {creating ? <CreateSupplier onDone={() => { setCreating(false); load(); }} /> : null}
      {merging ? (
        <MergeSuppliers
          rows={rows}
          onDone={(message) => { setMerging(false); setNote(message); load(); }}
        />
      ) : null}

      <ErrorBox error={error} onRetry={load} />

      {note ? (
        <p className="border border-ok-border bg-ok-bg px-2 py-1 text-2xs text-ok">{note}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search name, alias, GSTIN or ledger id"
        />
        {q ? (
          <span className="text-2xs text-slate-500">
            {filtered.length} of {rows.length}
          </span>
        ) : (
          <span className="text-2xs text-slate-500">{rows.length} suppliers</span>
        )}
      </div>

      {loading ? <Spinner label="Loading suppliers" /> : (
        <DataTable
          columns={columns}
          rows={filtered}
          keyField="_id"
          empty={
            q
              ? <Empty title="No supplier matches that." hint="Try a shorter search — an alias or a ledger id." />
              : (
                <Empty
                  title="No suppliers yet."
                  hint="Run Sync from ERP to create one for every supplier ledger in the ERP."
                />
              )
          }
        />
      )}
    </div>
  );
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Pick one supplier out of ~1,300 by typing.
 *
 * Not a `<select>`. A dropdown of 1,291 options is a scroll rather than a
 * choice, and here it would be a scroll immediately before an irreversible
 * delete — the two adjacent names a mis-click lands between are exactly the
 * near-duplicates somebody opened this panel to reconcile.
 *
 * The filter is local because the whole list is already loaded; a request per
 * keystroke would be slower than the filter it replaced.
 */
function SupplierSearchSelect({ rows, value, onChange, exclude }) {
  const [q, setQ] = useState('');
  const chosen = rows.find((r) => String(r._id) === String(value));

  const matches = useMemo(() => {
    const text = q.trim().toLowerCase();
    const pool = rows.filter((r) => String(r._id) !== String(exclude));
    if (!text) return pool.slice(0, 12);
    return pool
      .filter((r) => r.name.toLowerCase().includes(text)
        || (r.aliases || []).some((a) => a.toLowerCase().includes(text)))
      .slice(0, 12);
  }, [rows, q, exclude]);

  /*
    Deliberately one always-visible list rather than a control that collapses
    to the chosen name.

    The collapsing version swapped a <button> in for the <button> that had just
    been clicked, and the click still propagating from that physical node
    landed on the replacement — which happened to be "change", so every
    selection cleared itself the instant it was made and the screen looked as
    though clicking did nothing. Keying the two branches apart did not stop it.
    A list that never swaps out from under the pointer cannot have the problem
    at all, and it matches the picker on the confirmation screen.
  */
  return (
    <div className="border border-slate-300">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={chosen ? chosen.name : 'Type a supplier name…'}
        className="w-full border-b border-slate-200 px-1.5 py-1 text-xs focus:outline-none"
      />
      <ul className="max-h-36 overflow-y-auto">
        {matches.length ? matches.map((r) => {
          const picked = String(r._id) === String(value);
          return (
            <li key={r._id}>
              <button
                type="button"
                onClick={() => onChange(picked ? '' : String(r._id))}
                className={`w-full px-1.5 py-1 text-left text-xs hover:bg-slate-100 ${
                  picked ? 'bg-slate-100 font-medium' : ''
                }`}
              >
                {r.name}
              </button>
            </li>
          );
        }) : (
          <li className="px-1.5 py-1 text-2xs text-slate-500">Nothing matches.</li>
        )}
      </ul>
      {/*
        The chosen name is restated below the list because filtering can scroll
        it out of view, and a picker that shows no answer reads as unanswered.
      */}
      <p className="border-t border-slate-200 px-1.5 py-1 text-2xs text-slate-600">
        {chosen ? <>Chosen: <span className="font-medium">{chosen.name}</span></> : 'None chosen yet.'}
      </p>
    </div>
  );
}

/**
 * Merge one supplier into another.
 *
 * The correction path for the whole design, and the reason a supplier is its
 * own record rather than a bare LedgerID. Ledgers, aliases, GSTINs, mapped
 * items and rate history all move; the source name is kept as an alias, so a
 * later quote printing it still identifies.
 */
function MergeSuppliers({ rows, onDone }) {
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const source = rows.find((r) => String(r._id) === sourceId);
  const target = rows.find((r) => String(r._id) === targetId);
  const ready = source && target && sourceId !== targetId;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await suppliers.merge({ sourceId, targetId });
      onDone(
        `Merged ${source.name} into ${result.mergedInto}: `
        + `${plural(result.movedItems, 'mapped item')} and ${plural(result.movedRates, 'rate')} moved.`,
      );
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Merge this supplier" hint="It disappears; its name is kept as an alias.">
          <SupplierSearchSelect rows={rows} value={sourceId} onChange={setSourceId} />
        </Field>
        <Field label="Into this one" hint="Ledgers, GSTINs, mapped items and rate history all move here.">
          <SupplierSearchSelect rows={rows} value={targetId} onChange={setTargetId} exclude={sourceId} />
        </Field>
      </div>

      {/*
        Merging deletes a record and rewrites every rate that pointed at it.
        Naming both sides back to the reviewer is the whole safeguard — the
        dropdowns are long and adjacent names are easy to mis-click.
      */}
      {ready ? (
        <p className="mt-2 text-2xs text-warn">
          {source.name} will be deleted. Its ledgers, GSTINs, mapped items and rate history
          move to {target.name}. This cannot be undone from here.
        </p>
      ) : null}

      {error ? <div className="mt-2"><ErrorBox error={error} /></div> : null}

      <Button type="submit" variant="primary" disabled={busy || !ready} className="mt-3">
        {busy ? 'Merging…' : 'Merge'}
      </Button>
    </form>
  );
}

/**
 * Add a supplier by hand.
 *
 * Rare on purpose: Sync creates one per ERP ledger, so this is for the trader
 * who quotes but has no ledger yet.
 */
function CreateSupplier({ onDone }) {
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await suppliers.create({
        name: name.trim(),
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      });
      onDone();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field
          label="Aliases"
          hint="Comma separated. Other names this firm quotes under — misspellings included; SIEGWORK is in the data."
        >
          <Input value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>
      </div>

      {error ? <div className="mt-2"><ErrorBox error={error} /></div> : null}

      <Button type="submit" variant="primary" disabled={busy || !name.trim()} className="mt-3">
        {busy ? 'Adding…' : 'Add supplier'}
      </Button>
    </form>
  );
}
