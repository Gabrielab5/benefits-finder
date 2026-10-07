# Monthly refresh of the shared benefits catalog

Run by a scheduled task on the 1st of each month. Work in `C:\Users\gabri\my projects\benefits-finder`.

1. Run `node scripts/list-shared-programs.mjs` to get the shared programs (name, kind, benefits link).
2. For every program, research its **current** benefits on the web, official site first. Use one subagent per program, in parallel, model `sonnet`.
   - Follow the extraction rules in `SYSTEM_PROMPT` in `src/lib/ai/prompt.ts` exactly.
   - The known-store list is empty: put stores in `new_stores` and point to them with `new_store_index`; `store_id` is always null.
   - Never invent values, dates or codes; skip anything expired or unverifiable.
3. Save each program as `{ "source_url", "new_stores", "benefits" }` JSON in one temporary folder, file name = a short ASCII key (e.g. `max.json`).
4. Run `node scripts/load-researched-benefits.mjs <folder> <key>=<program name> …` for every file. This puts each program into the admin's "waiting for approval" list as a **shared** import. Do not approve anything.
5. End with one line per program: benefits found, and anything skipped and why.
