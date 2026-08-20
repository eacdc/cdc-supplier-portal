/**
 * Supplier groups.
 *
 * The one piece of master data the portal owns rather than reads, because the
 * ERP has no concept of "these five ledgers are one supplier". Without the
 * grouping, "who is cheapest" compares Siegwerk's Bhiwandi branch against its
 * Bengaluru branch and supplier scoring fragments into meaningless slices.
 *
 * Reconciliation surfaces unplaced ledgers rather than grouping them
 * automatically: a wrong grouping silently corrupts every comparison that
 * follows, and the cost of asking is one screen.
 */

import { useCallback, useEffect, useState } from 'react';
import { suppliers } from '../lib/api.js';
import { siteLabel } from '../lib/format.js';
import {
  Button, DataTable, Empty, ErrorBox, Field, Input, SectionHeading, Select, Spinner, Tag,
} from '../components/ui.jsx';

/**
 * Above this many unplaced ledgers, placing them by hand stops being a task
 * and starts being a wall. The list is capped here and the bulk action is
 * offered instead.
 */
const MANUAL_PLACEMENT_LIMIT = 50;

export default function Suppliers({ site }) {
  const [groups, setGroups] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGroups(await suppliers.list());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, site]);

  async function reconcile({ autoCreate = false } = {}) {
    setBusy(autoCreate ? 'autoCreate' : 'reconcile');
    setError(null);
    setNote(null);
    try {
      const result = await suppliers.reconcile({ autoCreate });
      setUnmatched(result.unmatched || []);
      setNote(
        autoCreate
          ? `Created ${result.created} group${result.created === 1 ? '' : 's'}, linked ${result.assigned} ledger${result.assigned === 1 ? '' : 's'} to groups already on file, and stored ${result.gstins?.updated ?? 0} GSTIN${result.gstins?.updated === 1 ? '' : 's'}.`
          : `Linked ${result.assigned} ledger${result.assigned === 1 ? '' : 's'} and stored ${result.gstins?.updated ?? 0} GSTIN${result.gstins?.updated === 1 ? '' : 's'}.`,
      );
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  /**
   * Populate the item groups each supplier has historically supplied.
   *
   * Tier 0 of the matcher narrows candidates to these, and it is what keeps an
   * ink supplier's quote away from shipper cartons. Without it every quote
   * line is matched against the whole item master.
   */
  async function refreshHistory() {
    setBusy('history');
    setError(null);
    setNote(null);
    try {
      const result = await suppliers.refreshHistory();
      setNote(`Read purchase history for ${result.updated} of ${result.groups} groups. Matching will now narrow to what each supplier actually sells.`);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function assign(ledgerId, groupId) {
    const group = groups.find((g) => String(g._id) === String(groupId));
    if (!group) return;
    await suppliers.update(groupId, {
      ledgerRefs: [...(group.ledgerRefs || []), { site, ledgerId }],
    });
    setUnmatched((prev) => prev.filter((u) => u.ledgerId !== ledgerId));
    load();
  }

  const columns = [
    { key: 'name', label: 'Supplier', width: '200px' },
    {
      key: 'ledgerRefs',
      label: `Ledgers at ${siteLabel(site)}`,
      render: (r) => {
        const here = (r.ledgerRefs || []).filter((l) => l.site === site);
        if (!here.length) return <span className="text-warn">none linked here</span>;
        return (
          <span className="font-mono text-2xs">{here.map((l) => l.ledgerId).join(', ')}</span>
        );
      },
    },
    {
      key: 'aliases',
      label: 'Also known as',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.aliases || []).map((a) => <Tag key={a}>{a}</Tag>)}
          {(r.tradesAs || []).map((a) => (
            <Tag key={a} title="Quotes arrive from this entity; POs go to the group">{a} (trader)</Tag>
          ))}
        </div>
      ),
    },
    {
      key: 'isInternal',
      label: '',
      width: '140px',
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
            <Button onClick={() => reconcile()} disabled={Boolean(busy)}>
              {busy === 'reconcile' ? 'Checking…' : 'Reconcile ERP ledgers'}
            </Button>
            <Button
              onClick={refreshHistory}
              disabled={Boolean(busy)}
              title="Read what each supplier has actually supplied, so matching narrows to those item groups."
            >
              {busy === 'history' ? 'Reading history…' : 'Refresh purchase history'}
            </Button>
            <Button variant="primary" onClick={() => setCreating((c) => !c)}>
              {creating ? 'Close' : 'New group'}
            </Button>
          </>
        }
      >
        Supplier groups
      </SectionHeading>

      {creating ? <CreateGroup onCreated={() => { setCreating(false); load(); }} /> : null}

      <ErrorBox error={error} onRetry={load} />

      {note ? (
        <p className="border border-ok-border bg-ok-bg px-2 py-1 text-2xs text-ok">{note}</p>
      ) : null}

      {unmatched.length ? (
        <section className="border border-warn-border bg-warn-bg p-2">
          <p className="text-xs font-semibold text-warn">
            {unmatched.length} ERP supplier ledger{unmatched.length === 1 ? '' : 's'} not linked to a group
          </p>
          <p className="mt-0.5 text-2xs text-warn">
            Until these are placed, their rates are invisible to comparison. Suggestions
            are scored by name similarity — check them rather than accepting them.
          </p>

          {/*
            Placing them one at a time is right for a handful and impossible
            for a thousand: on a first run there are ~1,300 ledgers and eight
            groups to choose from, so every dropdown below is a question with
            no right answer in it. The way out is offered here, next to the
            problem, rather than in a toolbar where it reads as routine.
          */}
          {unmatched.length > MANUAL_PLACEMENT_LIMIT ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 border border-warn-border bg-white px-2 py-1.5">
              <Button variant="primary" onClick={() => reconcile({ autoCreate: true })} disabled={Boolean(busy)}>
                {busy === 'autoCreate'
                  ? 'Creating groups…'
                  : `Create a group for each of the ${unmatched.length}`}
              </Button>
              <span className="flex-1 text-2xs text-slate-600">
                One supplier, one ledger — the honest starting point, and what you want on a
                first run. Branches that belong together (Siegwerk has five) get merged from
                this screen later, when somebody notices. Nothing is lost by starting here.
              </span>
            </div>
          ) : null}

          <ul className="mt-2 space-y-1">
            {unmatched.slice(0, MANUAL_PLACEMENT_LIMIT).map((row) => (
              <li key={row.ledgerId} className="flex flex-wrap items-center gap-2 bg-white px-2 py-1">
                <span className="font-mono text-2xs text-slate-500">{row.ledgerId}</span>
                <span className="text-xs">{row.ledgerName}</span>
                {row.suggestion ? (
                  <Tag title={`Name similarity ${row.suggestion.score}`}>
                    maybe {row.suggestion.name}
                  </Tag>
                ) : null}
                <Select
                  className="ml-auto w-56"
                  defaultValue={row.suggestion?.groupId || ''}
                  onChange={(e) => e.target.value && assign(row.ledgerId, e.target.value)}
                >
                  <option value="">Link to…</option>
                  {groups.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
                </Select>
              </li>
            ))}
          </ul>

          {/*
            A capped list that does not say it is capped reads as the whole
            list, and a reviewer who places these fifty would think they were
            finished.
          */}
          {unmatched.length > MANUAL_PLACEMENT_LIMIT ? (
            <p className="mt-1.5 text-2xs text-warn">
              Showing the first {MANUAL_PLACEMENT_LIMIT} of {unmatched.length}. The rest are
              not listed — rendering a thousand dropdowns helps nobody.
            </p>
          ) : null}
        </section>
      ) : null}

      {loading ? <Spinner label="Loading suppliers" /> : (
        <DataTable
          columns={columns}
          rows={groups}
          keyField="_id"
          empty={
            <Empty
              title="No supplier groups yet."
              hint="Run Reconcile to pull the ERP's supplier ledgers, then group the branches that belong together."
            />
          }
        />
      )}
    </div>
  );
}

function CreateGroup({ onCreated }) {
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [tradesAs, setTradesAs] = useState('');
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
        tradesAs: tradesAs.split(',').map((a) => a.trim()).filter(Boolean),
      });
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Aliases" hint="Comma separated. Branch names and misspellings — SIEGWORK is in the data.">
          <Input value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </Field>
        <Field
          label="Trades as"
          hint="Entities that quote on this supplier's behalf. Kamal Enterprises quotes; K K Emulsions invoices."
        >
          <Input value={tradesAs} onChange={(e) => setTradesAs(e.target.value)} />
        </Field>
      </div>

      {error ? <div className="mt-2"><ErrorBox error={error} /></div> : null}

      <Button type="submit" variant="primary" disabled={busy || !name.trim()} className="mt-3">
        {busy ? 'Creating…' : 'Create group'}
      </Button>
    </form>
  );
}
