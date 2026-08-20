/**
 * Board rate search.
 *
 * The question this screen exists for is "grey back, 280 gsm, who is cheapest"
 * — and until now there was nowhere to ask it. The Items screen searches the
 * ERP item master, which board quotes never name: a board is priced by grade
 * and GSM band, and one band covers many ItemIDs.
 *
 * Two things on every row earn their space, because without them a ranked list
 * of prices is misleading:
 *
 *   the band     42.00 quoted for 250-500 and 48.25 quoted with no GSM at all
 *                are not the same kind of claim
 *   the supply   mill order and ex-stock are two prices for one board, and
 *                which one applies depends on how fast you need it
 */

import { useCallback, useEffect, useState } from 'react';
import { boards } from '../lib/api.js';
import { Button, DataTable, Empty, ErrorBox, Field, Input, Select, Spinner, Tag } from '../components/ui.jsx';

export default function Boards({ site, plant }) {
  const [grades, setGrades] = useState([]);
  const [grade, setGrade] = useState('');
  const [gsm, setGsm] = useState('');
  const [form, setForm] = useState('');
  const [supplyMode, setSupplyMode] = useState('');
  const [thisPlantOnly, setThisPlantOnly] = useState(true);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    boards.grades().then(setGrades).catch(() => setGrades([]));
  }, [site]);

  const search = useCallback(async (event) => {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setResult(await boards.search({
        grade: grade || undefined,
        gsm: gsm || undefined,
        form: form || undefined,
        supplyMode: supplyMode || undefined,
        plant: thisPlantOnly ? plant : undefined,
      }));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [grade, gsm, form, supplyMode, thisPlantOnly, plant]);

  const columns = [
    {
      key: 'rate',
      label: 'Rate',
      width: '110px',
      render: (r) => (
        <span className="font-medium tabular-nums">
          {r.rate ?? '—'}
          {r.uom ? <span className="ml-1 text-2xs font-normal text-slate-500">/{r.uom}</span> : null}
        </span>
      ),
    },
    { key: 'supplier', label: 'Supplier', width: '160px', render: (r) => r.supplier || <span className="text-slate-400">unidentified</span> },
    { key: 'productName', label: 'Product' },
    {
      key: 'gsm',
      label: 'GSM band',
      width: '120px',
      render: (r) => (r.banded
        ? <span className="tabular-nums text-2xs">{r.gsmFrom ?? '…'}–{r.gsmTo ?? '…'}</span>
        : (
          /*
            Said plainly rather than left blank. A rate quoted for the grade at
            large sitting in a list sorted by price looks exactly like a rate
            quoted for the GSM you asked about, and it is a weaker claim.
          */
          <Tag title="This quote named no GSM, so the rate is for the grade at large — not for this GSM specifically">
            all gsm
          </Tag>
        )),
    },
    {
      key: 'supplyMode',
      label: 'Supply',
      width: '110px',
      render: (r) => (r.supplyMode
        ? <span className="text-2xs">{r.supplyMode.toLowerCase().replace('_', ' ')}</span>
        : <span className="text-2xs text-slate-400">—</span>),
    },
    {
      key: 'detail',
      label: '',
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          {r.brightness ? <Tag>{r.brightness}</Tag> : null}
          {r.productForm ? <Tag>{r.productForm}</Tag> : null}
          {r.quoteStrength === 'SOFT' ? <Tag title="An indicative quote — a benchmark, never hard evidence against a PO">soft</Tag> : null}
          {/*
            Only worth showing when the results span plants. Filtered to one,
            it is the same word on every row — noise that crowds out the tags
            that do differ.
          */}
          {!thisPlantOnly && r.plant ? <Tag>{r.plant.toLowerCase()}</Tag> : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="border border-slate-200 bg-white p-3">
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Grade">
            <Select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Any grade</option>
              {grades.map((g) => (
                <option key={g.canonical} value={g.canonical}>
                  {g.label}{g.rows ? ` (${g.rows})` : ' — none on file'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="GSM" hint="A single number. 280 finds every band containing it.">
            <Input
              type="number"
              value={gsm}
              onChange={(e) => setGsm(e.target.value)}
              placeholder="280"
            />
          </Field>
          <Field label="Form">
            <Select value={form} onChange={(e) => setForm(e.target.value)}>
              <option value="">Reel or sheet</option>
              <option value="REEL">Reel</option>
              <option value="SHEET">Sheet</option>
            </Select>
          </Field>
          <Field label="Supply">
            <Select value={supplyMode} onChange={(e) => setSupplyMode(e.target.value)}>
              <option value="">Either</option>
              <option value="MILL_ORDER">Mill order</option>
              <option value="EX_STOCK">Ex-stock</option>
            </Select>
          </Field>
        </div>

        {/*
          The button sits with the checkbox rather than in the grid: as a fifth
          column it was dragged out of line by the GSM hint growing its row,
          and a primary action visibly out of line with its inputs reads as
          broken.
        */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </Button>
          <label className="flex items-center gap-1.5 text-2xs text-slate-600">
            <input
              type="checkbox"
              checked={thisPlantOnly}
              onChange={(e) => setThisPlantOnly(e.target.checked)}
            />
            Only rates quoted for {String(plant || '').toLowerCase()}
            <span className="text-slate-400">
              — rates are never shared between plants, so comparing across them is for reference only
            </span>
          </label>
        </div>
      </form>

      <ErrorBox error={error} onRetry={search} />

      {loading ? <Spinner label="Searching board rates" /> : null}

      {!loading && result ? (
        <>
          <p className="text-2xs text-slate-500">
            {result.rows.length} rate{result.rows.length === 1 ? '' : 's'} from {result.quotes} live
            quote{result.quotes === 1 ? '' : 's'}, cheapest first. Expired quotes are excluded.
          </p>
          <DataTable
            columns={columns}
            rows={result.rows}
            keyField="lineId"
            empty={
              <Empty
                title="No board rate matches that."
                hint="Try without the GSM, or a different grade. A grade showing “none on file” has no quotes behind it yet."
              />
            }
          />
        </>
      ) : null}

      {!loading && !result ? (
        <Empty
          title="Search board rates across every quote on file."
          hint="Pick a grade and a GSM — 280 finds every band that contains it, however each supplier spelled the grade."
        />
      ) : null}
    </div>
  );
}
