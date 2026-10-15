# Budgeting Everything

I built Budgeting Everything to make spending records easier to inspect and explain. I included transaction filters, merchant and category summaries, refund matching, and optional AI summaries based on calculated results.

I used Next.js, React, and JavaScript. I keep the ledger calculations separate from the optional model calls so totals come from the records rather than generated text.

## Running it

I install dependencies with `npm ci`, start the app with `npm run dev`, and open `http://127.0.0.1:3000`. The saved review and AI routes are intended for local use.

I included six completely fictional transactions for demonstration. I left the original financial records, receipts, and review notes out of this repository. Optional AI features require my own server environment settings.
