/**
 * Drop files here.
 *
 * The whole point of the upload flow is that there is nothing to fill in, so
 * this is the entire form. It accepts a drop, a click, or a paste — a quote
 * that arrived as a screenshot in WhatsApp is pasted, not saved and browsed to.
 *
 * Drag events are the fiddly part: `dragleave` fires when the pointer crosses
 * into a child element, so a naive implementation flickers. A depth counter
 * fixes it, which is why one is here rather than a boolean.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export const ACCEPTED = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.csv,.docx';

export default function DropZone({ onFiles, disabled, children, hint }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const input = useRef(null);

  const take = useCallback((list) => {
    const files = [...(list || [])].filter(Boolean);
    if (files.length) onFiles(files);
  }, [onFiles]);

  // Paste anywhere on the page. A screenshot of a quote on a phone is the
  // second most common way one arrives, and making it a first-class input
  // costs nothing.
  useEffect(() => {
    if (disabled) return undefined;
    function onPaste(event) {
      const files = [...(event.clipboardData?.files || [])];
      if (files.length) {
        event.preventDefault();
        take(files);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [take, disabled]);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        if (!disabled) setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) { depth.current = 0; setOver(false); }
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        if (!disabled) take(e.dataTransfer?.files);
      }}
      onClick={() => { if (!disabled) input.current?.click(); }}
      className={`cursor-pointer border-2 border-dashed px-4 py-8 text-center transition-colors ${
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50'
          : over
            ? 'border-slate-900 bg-slate-100'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => { take(e.target.files); e.target.value = ''; }}
      />
      {children || (
        <>
          <p className="text-sm font-medium text-slate-700">
            Drop supplier quotes here
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {hint || 'PDF, photo, screenshot or spreadsheet — several at once is fine. Or click to browse, or paste from the clipboard.'}
          </p>
        </>
      )}
    </div>
  );
}
