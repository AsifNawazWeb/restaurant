# RestoPulse POS

Offline-first desktop restaurant POS for Pakistan.

- **Currency:** PKR (`Rs. 1,234`) — stored as integer cents, displayed as whole rupees
- **Tax:** FBR Sales Tax / GST (default 18%, configurable in Settings; STRN/ NTN printed on receipts)
- **Database:** built-in `node:sqlite` (`DatabaseSync`, WAL mode) via `drizzle-orm/node-sqlite` — zero native rebuilds
- **Printing:** ESC/POS thermal (`node-thermal-printer`) over LAN/USB/serial with offline file-spool fallback; RJ11 cash-drawer kick
- **UI:** Electron 44 + React 19 + Tailwind 4 + shadcn-style primitives, zinc/slate dark & light themes, indigo accent
- **Checkout:** single-click **Generate Bill** — payment method (Cash default / Card / Split) chosen from a dropdown, no payment modal; receipt prints immediately

## Run

```bash
npm install        # first time (Linux + non-root: sandbox helper may need sudo; use scripts/dev.sh otherwise)
npm run dev        # dev app window
```

On Linux without setuid chrome-sandbox rights, run `scripts/dev.sh` (exports `ELECTRON_DISABLE_SANDBOX=1`).

## Package

```bash
npm run dist       # electron-vite build + electron-builder (NSIS / AppImage / deb)
```

## Tests

```bash
npm test           # vitest: money math, POS totals, BOM deduction, weighted avg, shift variance, license state machine
npm run typecheck  # main + renderer projects
```

## Keyboard

Shortcuts still work but are no longer shown in the UI.

| Key | Action |
|---|---|
| F1 | Dashboard |
| F2 | POS Billing (press again on POS = new bill) |
| F3 | Menu Items |
| F4 | Stock & Inventory |
| F5 | Reports & Shift |
| F6 | Settings |
| Ctrl+F | Focus POS search |
| F12 | Generate Bill (POS, current payment method) |

## License & Activation

Offline, machine-bound licensing (Ed25519, no server). First run starts a **14-day free trial**; after it ends a **3-day grace period** keeps the app usable, then the POS locks until activated. Trial/grace are surfaced as a daily warning modal, a sidebar pill, a red grace banner, and an activation screen.

- **Machine ID:** shown on the activation screen / Settings → License; send it to the vendor on WhatsApp (+92 313 9329499).
- **State:** encrypted (`license.dat` + `license.bak` in `userData`) and mirrored into the DB `app_meta` table so deleting files or restoring an old database cannot reset the trial.
- **Enforcement:** every IPC call except license status/activate/import and https links is blocked in the main process when the license is unusable.
- **Dev bypass:** `RESTOPULSE_LICENSE_BYPASS=1` while unpackaged forces a `licensed` state.

### Vendor: issuing keys

```bash
node tools/keygen.cjs generate                       # once — creates tools/keys/vendor-private.pem (never ship; back it up)
node tools/keygen.cjs issue --machine XXXX-XXXX-XXXX-XXXX --customer "Restaurant Name" [--expires YYYY-MM-DD] [--out license.lic]
node tools/keygen.cjs inspect --key RPP1-...
```

`RPP_KEY_PASSPHRASE` skips the interactive passphrase prompt. The public key is embedded in `src/main/license/vendorPublicKey.ts`; regenerating the pair invalidates all issued keys. Keys are perpetual unless `--expires` is passed.

## Data

Dev DB: `data/restopulse.db` (WAL). Packaged DB lives in the OS `userData` dir.
First launch seeds a Pakistani demo dataset (Shinwari Restaurant, Peshawar — categories, menu + variants, raw materials, BOM lines, purchases, 3 days of orders, shifts).
When the license locks, a one-time safety copy of the DB is written to `userData/backups/`.

## Architecture

```
src/main        Electron main: node:sqlite (WAL) + drizzle, services (catalog, inventory BOM,
                checkout transaction, shifts, reports, users, printer), typed IPC handlers
src/preload     contextBridge -> typed window.api (IpcResult<T> envelope)
src/shared      money (PKR cents), totals math, types, constants — single source of truth
src/renderer    React UI: stores (zustand), shadcn-style primitives, 6 screens
```

The checkout flow runs in a single SQLite transaction: order + items + payments, BOM
deduction per recipe line, stock-movement ledger rows, COGS snapshot, low-stock alerts.
