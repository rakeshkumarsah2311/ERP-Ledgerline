# Ledgerline: start-to-finish test guide

A complete story for a small building-materials business, **Sharma Building Supplies** (Siliguri, West Bengal), that takes you through every module in the order a real business would use it. Every figure below was produced by running the story against the real server; where something depends on today's date, it says so.

## Two ways to use this guide
**A. Load everything in one command (fastest).** Start the server, then run the loader. It creates the business, the five users and all the transactions below, and prints a self-check (✓ lines).
```
npm run server          # terminal 1
npm run demo            # terminal 2 (needs a fresh database; delete server/ledgerline.db to start over)
npm run dev             # terminal 3, then open http://localhost:5173
```
**B. Type it yourself (best for testing the screens).** Follow Stages 1 to 13. Use a fresh database, and enter the data exactly as shown.

**Logins** (password for all: `Demo@1234`): admin@ledgerline.test · manager@ledgerline.test · accountant@ledgerline.test · staff@ledgerline.test · ceo@ledgerline.test
If you do it manually, sign up as admin on the sign-up screen and create the other four in *Team & roles*.

## The big picture: how one rupee flows
```
Supplier ──PO──▶ Goods received ──▶ Stock (lots, warehouses) ──▶ Invoice ──▶ Customer pays
   │                 │                      │                       │              │
 approval        Dr Inventory           deducted oldest-lot      Dr Receivable   Dr Bank/Cash
 if > limit      Dr GST input           first (FIFO)             Cr Sales        Cr Receivable
                 Cr Payable             Dr COGS / Cr Inventory   Cr GST payable
```
Every business event posts a balanced journal entry automatically; nothing is typed twice. The reports (statements, GST, dashboards, forecasts) are all calculated from those entries.

## Master data (Stages 1 and 2)
| Item | Enter |
|---|---|
| Company | Sharma Building Supplies · 12 Hill Cart Road, Siliguri, West Bengal · phone 9800000000 · GSTIN 19ABCDE1234F1Z5 · PAN ABCDE1234F · pincode 734001 · tick *e-invoicing* · currency INR · FY starts April · purchase approval limit 50000 · monthly target 300000 · customer terms 30 days · supplier terms 30 days · template Modern |
| Warehouses | Main warehouse (exists) · Showroom - Siliguri |
| Centres | Profit: Projects, Retail counter · Cost: Showroom operations |
| Suppliers | Ply Mart Pvt Ltd (GSTIN 19AAACP1111A1Z5) · Volt Cables (19AAACV2222B1Z3) |
| Customers | Cummins India (GSTIN 19AAACC1206D1ZM, pincode 734003, **credit limit 100000**) · Tata Projects (19AAACT2803M1Z4, pincode 734004, **credit limit 50000**) · Walk-in customer (no GSTIN) |

| Code | Product | Sell | Cost | HSN | GST | Reorder | Max |
|---|---|---|---|---|---|---|---|
| P1001 | Green Ply 18mm | 1200 | 800 | 4412 | 18% | 20 | 150 |
| P1002 | Copper Wire 1.5mm (90m) | 2400 | 1700 | 8544 | 18% | 25 | – |
| P1003 | Chrome Faucet | 650 | 400 | 8481 | 18% | 15 | – |
| P1004 | Wall Primer 20L | 3100 | 2200 | 3208 | 18% | 40 | – |
| P1005 | PVC Pipe 1 inch | 180 | 120 | 3917 | 12% | 30 | 150 |

Tick *Manage quantity* on all five. (The GST rates are sample values for testing; confirm real rates with your tax advisor.) **Budgets** (Financial intelligence → Budgets, for last month and this month): Rent 12000 · Utilities 4000 · Transport 6000.

**What to check:** entering a wrong GSTIN (e.g. 19ABC) is rejected; a duplicate product code or barcode is rejected.

## Stage 3: Opening position
1. *Accounting → Journal*: date = first day of last month, Dr **Bank Account 1,000,000**, Cr **Owner's Capital 1,000,000**.
2. *Lots & batches*: lot PR-0126, product P1004, qty 40, warehouse Main, **expiry = 20 days from today**.
3. *Journal*: Dr **Inventory 88,000**, Cr **Owner's Capital 88,000** (40 × ₹2,200 opening stock at cost).

**Why step 3:** adding a lot by hand changes stock but does not touch the books. Opening stock that you add this way needs its own journal. Stock that arrives through a purchase order is booked automatically.

## Stage 4: Purchasing
| PO | Supplier | Lines | Base | GST | Total |
|---|---|---|---|---|---|
| PO-1001 (dated 45 days ago) | Ply Mart | 100 × P1001 @800 · 40 × P1003 @400 | 96,000 | 17,280 | **113,280** |
| PO-1002 | Volt Cables | 30 × P1002 @1700 | 51,000 | 9,180 | **60,180** |
| PO-1003 | Ply Mart | 200 × P1005 @120 (12%) | 24,000 | 2,880 | **26,880** |

Steps (as manager): create the PO → **Submit for approval** (PO-1001 and PO-1002 exceed ₹50,000). Try *Receive goods* now: it is refused. Sign in as admin → *Approvals* → approve. Back as manager: send on WhatsApp (opens a pre-filled chat) → **Receive goods**. Each line becomes a lot (e.g. `PO-1001-1`), stock rises, and the books post **Dr Inventory, Dr GST Input, Cr Accounts Payable**.
Then as accountant, *Pay supplier*: PO-1001 **60,000** (bank), PO-1002 **60,180** (bank), PO-1003 **26,880** (bank). PO-1001 keeps a balance of **53,280**.
**Expected:** Accounts Payable ₹53,280; GST Input ₹29,340 so far; a payment larger than the balance is refused.

## Stage 5: Sales
Customers are in West Bengal, like the company, so tax splits into **CGST + SGST** (half each).
| Invoice | Customer | Lines | Taxable | GST | Total |
|---|---|---|---|---|---|
| 1234 | Cummins | 10 × P1001 @1200 · 2 × P1002 @2400 · **discount 500** | 16,300 | 2,934 | **19,234** |
| 1235 (dated 45 days ago) | Tata Projects | 20 × P1001 · 10 × P1003 @650 | 30,500 | 5,490 | **35,990** |
| 1236 | Walk-in | 10 × P1005 @180 (12%) · 2 × P1003 | 3,100 | 450 | **3,550** |
| 1237 | Cummins | 5 × P1004 @3100 · 3 × P1002 | 22,700 | 4,086 | **26,786** |
| 1238 | Tata Projects | 15 × P1001 · 5 × P1002 | 30,000 | 5,400 | **35,400** |
| 1239 | Cummins | 20 × P1001 · 15 × P1003 | 33,750 | 6,075 | **39,825** |

* **1234 as admin:** approved immediately. Open it: tax breakup, amount in words, lot shown (e.g. `PO-1001-1×10`), and *Download PDF* (print dialog). Entries: **Dr Receivable 19,234 · Cr Sales 16,300 · Cr GST payable 2,934 · Dr COGS 11,400 · Cr Inventory 11,400.**
* **1235 as staff:** status *Awaiting approval*. Check that stock and the ledger have not changed. Staff cannot approve it. As manager, approve it; now stock drops and entries post (and posting is never repeated if you reopen the invoice).
* **1236:** record a **cash** receipt of 3,550 the same day. The invoice shows *Paid in full*.
* **1237** is fine. **1238 as manager is refused**: Tata would owe 35,990 + 35,400 = 71,390, above its ₹50,000 limit. Create it as admin (admins may override).
* **Payments on Cummins invoice 1234:** 10,000 (bank, last month) and later 5,000 (bank). The balance shows after each.
* Product-label QR, barcode scanning (type `89010` + code digits, e.g. `890101001`, into the scan box) and catalogue search can be tried while creating invoices.

## Stage 6: Sales return
As accountant: *Sales returns* → invoice 1234 → return **2 × P1001**, reason "Damaged in transit", tick *back into stock*.
**Expected: CN-1001, taxable 2,328.57, GST 419.14, total 2,747.71** (the ₹500 discount is spread across lines in proportion, so a return gets its fair share). Entries: Dr Sales 2,328.57, Dr GST payable 419.14, Cr Receivable 2,747.71; Dr Inventory 1,600 / Cr COGS 1,600. Stock +2 in a new lot `RET-CN-1001-1`. Returning more than was invoiced is refused ("Only … can still be returned").

## Stage 7: Expenses, recurring, assets
| Date | Head | Amount | GST | Paid from | Centre |
|---|---|---|---|---|---|
| last month | Rent | 12,000 | 0 | Bank | Showroom operations |
| this month | Rent | 12,000 | 0 | Bank | Showroom operations |
| last month | Utilities | 3,200 | 576 | Bank | Showroom operations |
| this month | Utilities | **4,500** | 810 | Bank | Showroom operations |
| this month | Transport | 2,200 | 0 | Cash | – |

* **Recurring:** "Insurance premium", first date today, Dr Office & Misc 1,500 / Cr Bank 1,500 → *Post what is due now* posts one entry; pressing it again posts **nothing** (no duplicates).
* **Fixed asset:** Delivery tempo, cost 240,000, salvage 40,000, 8 years, paid from bank. *Post depreciation* for last month and this month: **₹2,083.33 each** (200,000 ÷ 96). Posting the same month again does nothing.
* This month's Utilities (4,500) is **over the 4,000 budget** → red in Budgets, a notification, and an automation task later.

## Stage 8: Warehouse
*Warehouses → Transfer*: 20 × P1001 from Main to Showroom. *Physical stock count* at Showroom: count **19** → variance −1 → *Post 1 adjustment*. Entries: Dr Stock Adjustments 800 / Cr Inventory 800. The movement log shows *transfer out*, *transfer in*, *count*. In *Lots & batches*, click **Trace** on a lot to see which invoices and customers it supplied.

## Stage 9: CRM
Add three leads (Anil Gupta / Gupta Constructions 250,000 · Bina Roy / Roy Interiors 90,000 · Kiran Lama / Lama Hotels 400,000), follow-up today. Move one through the pipeline to *Won* and click *Make customer*. *Customer 360* shows lifetime value, profit, outstanding and credit used (Tata Projects: 71,390 against 50,000 limit → over 100%).

## Stage 10: GST compliance (sandbox)
Open invoice 1234 → **GST compliance** panel → *Generate IRN* (a test IRN is created and printed with a QR on the invoice; *Cancel IRN* works only within 24 hours). On 1235 enter vehicle `WB74AB1234`, distance 120 → *Generate e-way bill* (valid 1 day per 200 km → 1 day). *Download JSON* gives the files for the government portals. **GST & e-invoicing → GST returns:** pick the month: GSTR-1 shows B2B (Cummins, Tata), B2C (Walk-in), HSN summary and credit notes (CDNR); GSTR-3B shows output tax less input credit. *Submit via GSP* is simulated in sandbox mode and is labelled so.

## Stage 11: Automation and notifications
*Automation centre → Run rules now.* Expected **8 new tasks**: 3 reorder suggestions (Copper Wire 20 left vs 25, Chrome Faucet 13 vs 15, Wall Primer 35 vs 40), 1 lot-expiry notice (PR-0126), 3 leads assigned to the only staff member (Sam), 1 over-budget (Utilities). Because 1235 was back-dated 45 days, an **overdue-invoice reminder** also appears with a *Send on WhatsApp* link. Run the rules again: **no duplicates**. Overstock on PVC Pipe (190 vs max 150) shows in the bell. Turn the *credit limit* rule off and the Tata invoice is no longer blocked for managers.

## Stage 12: Read the results
**Ledger balances after the whole story** (Accounting → Trial balance; amounts do not depend on today's date):
| Account | Balance | Account | Balance |
|---|---|---|---|
| Cash in Hand | 1,350.00 Dr | Accounts Payable | 53,280.00 Cr |
| Bank Account | 593,354.00 Dr | GST Output Payable | 24,015.86 Cr |
| Accounts Receivable | 139,487.29 Dr | Owner's Capital | 1,088,000.00 Cr |
| Inventory | 167,800.00 Dr | Sales Revenue | 134,021.43 Cr |
| GST Input Credit | 30,726.00 Dr | Cost of Goods Sold | 90,400.00 Dr |
| Fixed Assets | 240,000.00 Dr | Stock Adjustments | 800.00 Dr |
| Accumulated Depreciation | 4,166.66 Cr | Rent / Utilities / Transport / Office | 24,000 / 7,700 / 2,200 / 1,500 Dr |
| | | Depreciation Expense | 4,166.66 Dr |

**Net profit = ₹3,254.77** (revenue 134,021.43 − expenses 130,766.66); gross profit 43,621.43. Receivables 139,487.29 = invoices 160,785 − receipts 18,550 − credit note 2,747.71 ... shown per customer: Cummins 68,097.29 · Tata 71,390 · Walk-in 0. **Stock:** P1001 36 · P1002 20 · P1003 13 · P1004 35 · P1005 190. **Trial balance debits = credits** (1,798,983.33 before the later date-dependent items, equal whatever the date).

What each screen should show:
* **Dashboard / Command Centre:** health score about 74 (Good), explained by five parts (liquidity 100, receivables lower because of the overdue invoice, profitability low at 2.4%, inventory 100, growth). The daily summary lists revenue change, 3 products low, receivables up, 1 supplier payment overdue (₹53,280), 1 customer invoice overdue (₹35,990), cash outlook, 1 budget breach. Cash forecast is positive (about ₹675,000 in 30 days) because of the bank balance, and the page lists its assumptions.
* **Analytics:** product margins (Green Ply 33%, Copper Wire 29% …), slow-moving none, inventory valuation at cost.
* **Financial intelligence:** *Credit risk*: Tata Projects is **Medium/High** (overdue share and over its limit). *Ratios:* current ratio about 12, DSO and DPO shown. *Cash flow* shows the 30/60/90 rows.
* **Accounts receivable ageing:** invoice 1235 sits in **31–60 days**; PO-1001 in payables ageing likewise.

## Stage 13: Month-end close, security and backup
1. *Financial intelligence → Period closing*, choose **last month**. Expected checks: trial balance ✓, receivables ✓, payables ✓, GST ✓, no pending invoices ✓, purchase orders ✓, budgets ✓, and one **Review**: *bank lines not cleared*. Go to *Accounting → Bank reconciliation*, tick last month's bank lines, and the check passes. *Generate closing report* (prepared-by / approved-by lines, print to PDF) → **Close period**.
2. Try posting a journal dated in that month → **refused: "period is closed"**. As accountant, *Reopen* is not offered; as admin, reopen needs a reason (≥5 characters) and is recorded.
3. *Security & audit*: every change with user, role, record and IP; *Login history* shows each sign-in. *Backup & restore*: download a backup, delete a customer, restore the file, and the customer, all invoices and the books return exactly.
4. **Roles:** ceo can view everything but every save is refused; staff cannot approve, edit company settings or see Accounting; accountant can post journals and payments but cannot create products; only admin sees Team & roles and can approve large POs.

## Things that must be refused (negative tests)
Receiving a PO before approval · paying more than the balance · returning more than invoiced · an unbalanced journal · posting into a closed month · a staff invoice approving itself · a manager invoice above the credit limit · a CEO editing anything · a second receipt for the same PO · an invalid GSTIN or duplicate barcode.

## Good to know
* Opening stock added by hand needs a matching journal (Stage 3). Stock from purchase orders does not.
* Posted entries are never edited. Correct mistakes with a new journal, a credit note, or a stock count.
* Ageing, overdue flags, expiry alerts and monthly splits depend on today's date, which is why two documents are back-dated 45 days.
* The e-invoice, e-way bill and return submissions are **simulated** unless you configure a GSP; nothing reaches the government.
* Email reminders need SMTP set up; WhatsApp creates a ready-to-send link rather than sending by itself.
* To start again: stop the server, delete `server/ledgerline.db`, and restart.
