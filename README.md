# Ledgerline: Enterprise Intelligence Edition
Inventory · warehouses · sales & CRM · purchasing · double-entry accounting · GST compliance · executive intelligence · automation. React + Express + SQLite.

## Run
    npm install
    npm run dev           # API + database, then React app on http://localhost:5173
    npm run server        # API only, if you want to run the frontend separately
    npm test              # 17 unit tests + 19 end-to-end workflow tests (starts the real server on a temporary database)

Single server: `JWT_SECRET=your-long-random-string npm start`. Databases from earlier versions upgrade automatically (new columns and tables are added on start; no data is removed).

## Try it with sample data
`npm run demo` (with the server running and an empty database) loads a complete sample business and self-checks the results. `TESTING_GUIDE.md` walks through every module with the data and expected figures.

## Environment variables
| Variable | Purpose |
|---|---|
| JWT_SECRET | Signs login tokens. Always set in production. |
| PORT | Server port (default 3001). |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM | Enables account activity alerts to `rsha230121@gmail.com`, password recovery emails, and automated email. Needs the optional `nodemailer` package. |
| APP_URL | Public frontend URL used to build password recovery links when the app is hosted separately from the API. |
| GST_MODE=live, GSP_URL, GSP_CLIENT_ID, GSP_CLIENT_SECRET, GSP_GSTIN, GSP_USER, GSP_PASSWORD | Live GST calls through your GSP. Default is sandbox (simulated). |

## Roles
admin · manager · accountant · staff · viewer · ceo (read-only executive access). Enforced on the server.

## What the intelligence screens calculate
- **Health score**: weighted from liquidity (25), receivables (20), profitability (25), inventory (15), growth (15). A component without data is excluded, and every component shows its reason.
- **Daily summary**: sentences produced by rules from ledger figures. No model writes numbers.
- **Cash forecast**: opening cash + receivables due − supplier bills due − 3-month average running costs. Overdue items count as due now. Assumptions are shown on screen.
- **Period closing**: reconciliation checks (trial balance, receivables and payables ledgers against open items, GST, bank, approvals, budgets). Closed periods reject all postings until an admin reopens them with a reason.
- **Automation**: rules evaluate every 15 minutes (and on demand), create de-duplicated tasks, and log every run. WhatsApp produces a click-to-send link; email needs SMTP.

## Accounting rules
Approved invoice → Dr Receivable, Cr Sales + GST payable, Dr COGS / Cr Inventory. Goods received → Dr Inventory + GST input, Cr Payable. Receipts, supplier payments, expenses, stock counts and depreciation post automatically. Entries are never edited: correct with a new journal.
