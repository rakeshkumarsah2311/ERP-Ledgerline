# Ledgerline: Enterprise Intelligence Edition
Inventory · warehouses · sales & CRM · purchasing · double-entry accounting · GST compliance · executive intelligence · automation. React + Express + SQLite.

## Run
    npm install
    npm run dev           # API + database, then React app on http://localhost:5173
    npm run presentation  # Local, no-hosting-cost client demo with sample data
    npm run server        # API only, if you want to run the frontend separately
    npm test              # 17 unit tests + 19 end-to-end workflow tests (starts the real server on a temporary database)

Single server: `JWT_SECRET=your-long-random-string npm start`. Databases from earlier versions upgrade automatically (new columns and tables are added on start; no data is removed).

## Production deployment (Vercel + Oracle Cloud Always Free)
The frontend deploys to Vercel. The Express API and SQLite database need a persistent machine; Vercel Functions have ephemeral storage. Oracle Cloud offers Always Free VM resources that can run this existing Node + SQLite backend without moving the database to another product. Always Free has regional capacity limits, so an instance might not be immediately available. Account signup requires payment card verification and may place a temporary authorization hold; resources within the Always Free limits are not billed. See Oracle's [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) and [Free Tier FAQ](https://www.oracle.com/cloud/free/faq/).

1. Create an Oracle Cloud Free Tier account. Create an Ubuntu VM using an **Always Free Eligible** shape. The Ampere A1 allocation currently includes up to 2 OCPUs and 12 GB memory total; a 1 OCPU / 6 GB VM fits within it. Choose a public subnet and assign a public IPv4 address.
2. In the VM's VCN security list, allow inbound TCP 22 for your SSH address, and TCP 80 and 443 for web traffic. Do not expose port 3001 publicly.
3. Create a free DuckDNS subdomain and point it to the VM's public IPv4 address. Install Caddy, then copy `deploy/Caddyfile.example` to `/etc/caddy/Caddyfile` and replace the example hostname. Caddy automatically provisions and renews HTTPS certificates for a public DNS name; see its [automatic HTTPS docs](https://caddyserver.com/docs/automatic-https). DuckDNS provides [free dynamic DNS](https://www.duckdns.org/faqs.jsp).
4. Install Git, Node.js 22, and the native build tools (`build-essential` and `python3`). Clone this repository to `/opt/ledgerline`, then run `npm ci --omit=dev` in that directory.
5. Create a `ledgerline` Linux user, and create `/var/lib/ledgerline` for the database. Create `/etc/ledgerline/ledgerline.env` with mode `600` containing `NODE_ENV=production`, `PORT=3001`, a long random `JWT_SECRET`, `LEDGERLINE_DB=/var/lib/ledgerline/ledgerline.db`, `APP_URL=https://erp-ledgerline.vercel.app`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, and `AUTH_ALERT_TO=rsha230121@gmail.com`. Keep SMTP credentials only in this VM environment file. For Gmail, use a Google App Password rather than your normal sign-in password.
6. Install `deploy/ledgerline.service` as `/etc/systemd/system/ledgerline.service`, ensure the `ledgerline` user owns `/opt/ledgerline` and `/var/lib/ledgerline`, then run `sudo systemctl daemon-reload && sudo systemctl enable --now ledgerline`.
7. In Vercel project settings, set `BACKEND_URL` to the HTTPS origin, such as `https://ledgerline-api.example.duckdns.org` (no `/api` suffix), for the Production environment. Redeploy Vercel after saving the variable.
8. Check `https://<your-duckdns-name>/api/health`; it should return `status: "ok"` and `emailConfigured: true`.

A new server database starts empty. Sign up on the production site or export the existing account from **Security → Backup & restore** before switching backends, then restore that backup after signing up. Deploying the code does not copy your local SQLite database.

Login and signup still succeed if an alert email cannot be delivered, but the signed-in screen shows a warning. Password recovery reports a server error when email delivery is unavailable. Alert emails include the account name, business, email, role, timestamp, IP address and browser user agent; they never include the password. Password reset links use `APP_URL` and expire after one hour.

## Try it with sample data
`npm run demo` (with the server running and an empty database) loads a complete sample business and self-checks the results. `TESTING_GUIDE.md` walks through every module with the data and expected figures.

For a client presentation without paying for a hosted API or database, run `npm run presentation` after `npm install`. It starts the API on your computer, uses the local SQLite database, loads the sample business, and starts the website. By default, sign in with `admin@ledgerline.test` / `Demo@1234`. To use a different local demo email, set `DEMO_EMAIL` and `DEMO_PASSWORD` in the terminal before launching; the password is never stored in project source. Keep the terminal open during the presentation. The demo database stays on your computer in `server/ledgerline.db`; it is not uploaded to Vercel. For a client on the same Wi-Fi, share your computer's local IP address with port `5173`. This is intended for an in-person demo, not public production hosting.

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
