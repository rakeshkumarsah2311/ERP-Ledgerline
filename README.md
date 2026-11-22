# Ledgerline: Enterprise Intelligence Edition
Inventory · warehouses · sales & CRM · purchasing · double-entry accounting · GST compliance · executive intelligence · automation. React + Express + SQLite.

## Run
    npm install
    npm run dev           # API + database, then React app on http://localhost:5173
    npm run server        # API only, if you want to run the frontend separately
    npm test              # 17 unit tests + 19 end-to-end workflow tests (starts the real server on a temporary database)

Single server: `JWT_SECRET=your-long-random-string npm start`. Databases from earlier versions upgrade automatically (new columns and tables are added on start; no data is removed).

## Production deployment (Vercel + Render)
The frontend deploys to Vercel. The Express API and SQLite database must run on a persistent server; Vercel Functions have ephemeral storage, so they cannot host this SQLite database. This repository includes a Render Blueprint (`render.yaml`) for the API and a Vercel proxy (`api/[...path].js`) for same-origin `/api` requests.

1. In Render, create a Blueprint from this repository and deploy `ledgerline-api`. The blueprint attaches persistent storage for SQLite.
2. Set the Render environment variables `APP_URL` to `https://erp-ledgerline.vercel.app`, and configure `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` with working email provider credentials. `AUTH_ALERT_TO` defaults to `rsha230121@gmail.com`.
3. In Vercel, set `BACKEND_URL` to the Render service's HTTPS origin, for example `https://ledgerline-api.onrender.com`, then redeploy the frontend.
4. Check `https://<render-service>.onrender.com/api/health`; it should return `status: "ok"` and `emailConfigured: true`.

The persistent database on a newly created backend starts empty. Sign up with the production account once, or export the existing account from **Security → Backup & restore** before switching backends and restore that file after signing up. A local SQLite database is not copied to Render by deploying the code.

Login and signup still succeed if an alert email cannot be delivered, but the signed-in screen shows a warning. Password recovery reports a server error when email delivery is unavailable. Alert emails include the account name, business, email, role, timestamp, IP address and browser user agent; they never include the password. Password reset links use `APP_URL` and expire after one hour.

## Try it with sample data
`npm run demo` (with the server running and an empty database) loads a complete sample business and self-checks the results. `TESTING_GUIDE.md` walks through every module with the data and expected figures.

## Environment variables
| Variable | Purpose |
|---|---|
| JWT_SECRET | Signs login tokens. Always set in production. |
| PORT | Server port (default 3001). |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM | Required for account activity alerts, password recovery emails, and automated email. Needs `nodemailer`. |
| AUTH_ALERT_TO | Login/signup alert recipient (defaults to `rsha230121@gmail.com`). |
| APP_URL | Public frontend URL used to build password recovery links, for example `https://erp-ledgerline.vercel.app`. |
| BACKEND_URL | On Vercel, the HTTPS origin of the persistent Render API service. |
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
