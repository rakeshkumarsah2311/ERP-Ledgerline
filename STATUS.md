# Ledgerline status (version 7)

## Verified by automated tests (36 passing, `npm test`)
Unit tests: double-entry rules and rounding, depreciation, sales-return maths, financial statements, cash forecast, executive summary wording, closing checks, credit risk, budgets, automation rules.
End-to-end tests against the running server and a temporary database, covering: sign-up and login, all six roles and their permissions, invoice approval and stock deduction by lot, exactly-once ledger posting, partial and full payments, credit limit (and switching the rule off), purchase orders with approval limit, goods receipt and supplier payment, expenses, manual journals, period closing and reopening, fixed assets, recurring entries, stock counts, automation (de-duplication and lead assignment), sales returns and credit notes, audit log, backup and restore, and tenant isolation.
The tests were also checked to be meaningful: deliberately disabling period locking and duplicate-posting protection made them fail.

## Not verified
- The React interface: no production build or browser test was possible in the environment used to write it. Run `npm run build` and click through each screen before relying on it.
- The end-to-end tests ran with stand-in versions of express, better-sqlite3, bcrypt and jsonwebtoken (the real packages could not be installed there). Run `npm install && npm test` on your machine to repeat them with the real packages.
- Email sending (needs SMTP and nodemailer), WhatsApp Business API, and the live GST connection (needs a GSP). Sandbox mode is the default and is clearly labelled.
- Mobile layout and accessibility.

## Completed
Inventory, lots, barcode scanning, multi-warehouse and stock counts · sales, quotations, GST invoices, e-invoice and e-way bill payloads, GST returns · sales returns and credit notes · purchasing with approvals · double-entry accounting, payments, expenses, bank reconciliation, statements · budgets, cash forecast, credit risk, ratios, cost and profit centres, fixed assets, recurring journals, period closing · CRM and pipeline · executive Command Centre · Automation Centre · roles, audit log, backup and restore.

## Pending
Debit notes, delivery challans · multi-factor sign-in, single sign-on, session and IP controls, before/after audit values · sales targets and commissions, customer portal · ABC/FSN analysis, EOQ, serial numbers, picking and packing · Executive Reports Studio with scheduled reports · REST API keys, webhooks, marketplace · HR and payroll, POS, multi-company and branches, document management, subscriptions.
