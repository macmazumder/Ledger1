# PHASE 4 — Performance and daily-use speed
Version target: 4.0. Requires Phase 3.

## Goal
Entry #10,000 is as fast as entry #10. A shop assistant can log a sale in under 10 seconds on a phone.

## Tasks
- Measure first: add timing logs (server `console.time`, client `performance.now`) for load, append, update, delete; report numbers before and after.
- Load strategy: `getAllData` returns only what the opening screen needs; transaction tabs (Daily, Expenses, wallet/people/card tx) are loaded for a date window (default: current + previous month) with "Load older" on demand. Computations that need full history (wallet balances, people net, card outstanding) must come from SERVER-computed running totals or a cached summary so balances stay correct. Explain the design before coding.
- Use `CacheService` (short TTL, invalidated by the Phase 3 `dataVersion`) for repeated reads.
- Read only the used range (never `getRange(...maxRows...)` blind), use `getValues` once per tab.
- UI: render long tables in pages of 50 with a search box (category / note / amount) and date filter; no full `innerHTML` rebuild of the whole tab on every keystroke.
- Fast entry on mobile: Daily Ledger "quick add" row with remembered last category and wallet, large touch targets, number keyboard (`inputmode="decimal"`), Enter submits, focus returns to Amount.
- Keep all previous behaviour and tests passing.

## Acceptance
- With 10,000 Daily rows (seed helper from Phase 2): app opens in <3 s on a mid-range phone on 4G; adding an entry confirms in <2 s; balances still equal the full-history result (compare against a brute-force check function you provide).
