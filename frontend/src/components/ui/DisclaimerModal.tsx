'use client';

import { useEffect, useState } from 'react';

export function DisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div className="glass-card w-full max-w-lg max-h-[85vh] overflow-y-auto p-6">
        <h2 id="disclaimer-title" className="text-xl font-bold text-white">
          Disclaimer &amp; Terms of Use
        </h2>

        <div className="mt-4 space-y-3 text-sm text-text-muted">
          <p>
            AlphaterraSwapX is a decentralized interface for interacting with third-party
            blockchain protocols. Trading and swapping cryptocurrency tokens involves
            significant risk, including the potential loss of your entire investment.
            Prices, liquidity, and network conditions can change rapidly and without notice.
          </p>
          <p>
            Nothing on this page constitutes financial, investment, legal, or tax advice.
            You are solely responsible for verifying token contracts, transaction details,
            and network fees before confirming any swap. Alphaterracoin and its team make
            no warranties regarding the availability, accuracy, or security of this
            interface and are not liable for any losses arising from its use.
          </p>
          <p>
            By clicking &quot;OK, I Agree&quot; below, you confirm that you understand these
            risks, are legally permitted to use decentralized exchange services in your
            jurisdiction, and agree to these terms.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-text-muted space-y-2">
          <p className="font-semibold text-white">Before you swap, please note:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Reload the page immediately before performing a swap to ensure you have the latest prices and contract data.</li>
            <li>Make sure your PC or smartphone has sufficient free hard drive space.</li>
            <li>Make sure your device has enough available memory (RAM) to run the page and your wallet smoothly.</li>
            <li>Make sure you have a stable, sufficiently fast internet connection for optimal page loading and wallet connection.</li>
          </ul>
        </div>

        <button
          onClick={() => setOpen(false)}
          className="mt-6 w-full px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm transition-all shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)]"
        >
          OK, I Agree
        </button>
      </div>
    </div>
  );
}
