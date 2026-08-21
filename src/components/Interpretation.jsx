/**
 * Reading a paper quote, as a conversation.
 *
 * What the server understood, what it could not determine, and one button to
 * answer. It converges in one or two rounds because the questions asked are the
 * ones that actually matter for this document — a form would ask the same
 * twelve of every supplier and still miss the thirteenth.
 *
 * Two things shape the layout:
 *
 *  - **The understanding comes first, in prose.** It is what a buyer reads to
 *    decide whether the rest is worth checking. Field names are for the table
 *    below it.
 *  - **Questions are grouped by what would answer them.** Eighteen untyped
 *    lines off Sudarshan's virgin list are seven questions, one per brand, and
 *    each answer settles both forms and every GSM band beneath it.
 */

import { useEffect, useState } from 'react';
import { quotes, paper } from '../lib/api.js';
import { Button, ErrorBox, Tag } from './ui.jsx';

const STAGE_TONE = {
  INTERPRETED: 'border-ok-border bg-ok-bg',
  NEEDS_INPUT: 'border-warn-border bg-warn-bg',
  FAILED: 'border-block-border bg-block-bg',
};

export default function Interpretation({ doc, onChanged }) {
  const interpretation = doc.interpretation || {};
  const [types, setTypes] = useState([]);
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    paper.types().then(setTypes).catch(() => setTypes([]));
  }, []);

  const questions = interpretation.questions || [];
  const askable = questions.filter((q) => q.kind === 'PAPER_TYPE');
  const notes = interpretation.notes || [];

  // Every question has to be answered before sending. A partial round would
  // spend a call to be told about the ones still open.
  const allAnswered = askable.length > 0 && askable.every((q) => answers[q.brand]);

  async function run(payload) {
    setBusy(true);
    setError(null);
    try {
      await quotes.interpret(doc._id, payload);
      setAnswers({});
      await onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const send = () => run(askable
    .filter((q) => answers[q.brand])
    .map((q) => ({ kind: 'PAPER_TYPE', brand: q.brand, paperType: answers[q.brand] })));

  /*
    Before a first read there is nothing to show, and a full panel on every
    quote — including the inks and tapes that will never use this path — would
    be noise on screens that are already busy. A paper document announces
    itself; anything else gets one quiet line, because the classifier is not
    reliable enough to hide the option entirely.
  */
  if (!interpretation.stage) {
    const looksLikePaper = doc.materialClass === 'PAPER_BOARD';
    return (
      <section className={looksLikePaper ? 'border border-slate-200 bg-white p-3' : ''}>
        {looksLikePaper ? (
          <p className="text-xs text-slate-600">
            This is a paper or board quote and has not been read yet.
          </p>
        ) : null}
        <Button
          variant={looksLikePaper ? 'primary' : 'ghost'}
          className={looksLikePaper ? 'mt-2' : ''}
          disabled={busy}
          onClick={() => run([])}
        >
          {busy ? 'Reading…' : 'Read as a paper quote'}
        </Button>
        {error ? <div className="mt-2"><ErrorBox error={error} /></div> : null}
      </section>
    );
  }

  return (
    <section className={`border bg-white ${STAGE_TONE[interpretation.stage] || 'border-slate-200'}`}>
      <header className="flex flex-wrap items-baseline gap-2 border-b border-inherit px-3 py-1.5">
        <h2 className="text-xs font-semibold text-slate-700">What this quote says</h2>
        {/*
          Counts every open question, not just the ones with a dropdown. The
          header said "0 things need you" above a plant question nobody could
          answer from this panel, which reads as the screen contradicting
          itself — and the count is the thing a reviewer scans first.
        */}
        <StageLabel stage={interpretation.stage} open={questions.length} />
        <span className="ml-auto text-2xs text-slate-400">
          {interpretation.rounds || 0} round{interpretation.rounds === 1 ? '' : 's'}
          {interpretation.modelCalls ? ` · ${interpretation.modelCalls} model call${interpretation.modelCalls === 1 ? '' : 's'}` : null}
        </span>
      </header>

      <div className="space-y-3 px-3 py-2">
        {interpretation.understanding ? (
          <p className="text-xs leading-relaxed text-slate-800">{interpretation.understanding}</p>
        ) : null}

        {notes.length ? (
          <ul className="space-y-0.5">
            {notes.map((note) => (
              <li key={note} className="text-2xs text-slate-500">— {note}</li>
            ))}
          </ul>
        ) : null}

        {interpretation.error ? (
          <p className="border border-block-border bg-block-bg px-2 py-1 text-2xs text-block">
            {interpretation.error}
          </p>
        ) : null}

        {askable.length ? (
          <div>
            <p className="text-2xs uppercase tracking-wide text-slate-500">
              {askable.length} question{askable.length === 1 ? '' : 's'}
            </p>
            {/*
              One row per brand, not per line. The line count is shown because
              it is the reason to answer: settling a brand settles all of them.
            */}
            <ul className="mt-1 space-y-1">
              {askable.map((q) => (
                <li key={q.brand} className="flex flex-wrap items-center gap-2 border border-warn-border bg-white px-2 py-1">
                  <span className="text-xs font-medium">{q.brand}</span>
                  <span className="text-2xs text-slate-500">
                    {q.lineCount} line{q.lineCount === 1 ? '' : 's'}
                    {q.examples?.length ? ` · ${q.examples[0]}` : null}
                  </span>
                  <select
                    className="ml-auto w-52 border border-warn-border bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-warn"
                    value={answers[q.brand] || ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.brand]: e.target.value }))}
                  >
                    <option value="">What paper type is this?</option>
                    {types.map((t) => (
                      <option key={t.canonical} value={t.canonical}>{t.label}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <OtherQuestions questions={questions} />
      </div>

      {error ? <div className="px-3 pb-2"><ErrorBox error={error} /></div> : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-inherit px-3 py-1.5">
        {askable.length ? (
          <>
            <Button variant="primary" disabled={busy || !allAnswered} onClick={send}>
              {busy ? 'Applying…' : 'Answer'}
            </Button>
            <span className="text-2xs text-slate-600">
              {allAnswered
                ? 'Answers are remembered — this supplier’s next quote will not ask again.'
                : `Answer all ${askable.length} to continue.`}
            </span>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={() => run([])}>
              {busy ? 'Reading…' : 'Read again'}
            </Button>
            {/*
              A stage of NEEDS_INPUT with nothing answerable here means the open
              gaps belong to another panel — an unidentified supplier or plant,
              which the identification panel below settles. Saying "reading
              again costs a model call" there points at the wrong remedy.
            */}
            <span className="text-2xs text-slate-500">
              {interpretation.stage === 'INTERPRETED'
                ? 'Nothing is open. The rates are ready to be filed.'
                : questions.length
                  ? 'The remaining questions are answered in the panel below.'
                  : 'Reading again costs a model call.'}
            </span>
          </>
        )}
      </footer>
    </section>
  );
}

function StageLabel({ stage, open }) {
  if (stage === 'INTERPRETING') return <span className="text-2xs text-slate-500">reading…</span>;
  if (stage === 'INTERPRETED') return <span className="text-2xs text-ok">understood</span>;
  if (stage === 'FAILED') return <span className="text-2xs text-block">could not be read</span>;
  return (
    <span className="text-2xs font-medium text-warn">
      {open} thing{open === 1 ? '' : 's'} need you
    </span>
  );
}

/**
 * Gaps that are not a dropdown.
 *
 * An unpriced line is a misreading rather than a question, and an unknown
 * abbreviation needs someone who buys paper rather than a list to pick from.
 * Both are shown plainly instead of dressed up as something answerable here.
 */
function OtherQuestions({ questions }) {
  const others = questions.filter((q) => q.kind !== 'PAPER_TYPE');
  if (!others.length) return null;

  return (
    <ul className="space-y-1">
      {others.map((q) => (
        <li key={q.kind + (q.token || '')} className="flex flex-wrap items-center gap-2 text-2xs text-warn">
          <Tag>{q.kind.toLowerCase().replace('_', ' ')}</Tag>
          <span>{q.question}</span>
          {q.examples?.length ? (
            <span className="text-slate-500">{q.examples.join(' · ')}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
