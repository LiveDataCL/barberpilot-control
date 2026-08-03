# Attach a product sale to an already-open ticket — design doc

Status: **decisions confirmed 2026-08-03, implementation in progress** on
`feature/attach-product-to-service-commission` (draft PRs, not merged —
same visual-confirmation gate as every other billing-adjacent change this
session). §4 below records the confirmed decisions; the original open
questions are kept struck through rather than deleted, so the reasoning
trail stays intact.

Covers: the core data-model problem, two candidate approaches with tradeoffs,
a concrete consumer-by-consumer blast-radius inventory for the chosen
approach, and the resolved decisions that unblocked implementation.

This mirrors the precedent of
[barberpilot-api/docs/productos_catalog_design_2026-07-29.md](../../barberpilot-api/docs/productos_catalog_design_2026-07-29.md)
— schema DDL, endpoint contracts, and open questions flagged rather than
assumed — but spans both repos (barberpilot-api for the schema/route change,
barberpilot-control for the UI), since the feature genuinely touches both.

---

## 1. The core problem

`registros` is strictly one-row-per-transaction today: `id, fecha, hora, bid,
bnom, sid, snom, precio, pago, com, bb, neg, propina, cliente_id, estado, ...`
— one `sid`/`snom`/`precio` per row, no concept of "this row belongs to the
same visit as that other row."

Two write paths create rows, and neither has any way to relate a row to an
already-open one:

- **Sala de espera checkout** (`POST /queue/control/registrar`,
  [barberpilot-api/index.js:3723](../../barberpilot-api/index.js#L3723)) closes
  a `queue` entry and inserts exactly one `registros` row for the service.
- **Product sale from the checkout sidebar** (`registrarProducto()`,
  [index.html:2168](../index.html#L2168) → `enviarAApi(r)` → `bp_outbox` →
  `POST /registros`) builds and sends its own fully independent registro —
  `id:'TK'+now.getTime()`, no `queue_id`, no reference of any kind back to
  whatever service ticket might currently be open for that client/barber.

Concretely, this is why "Agregar servicio extra" (fixed in the paired
`fix/sala-extra-servicio-persist` PR) can merge a second *service* into the
same `queue` row's single `service` text field (a hack that already exists),
but there is no equivalent path for a *product* — a product sale has never
been anything other than a brand-new, unrelated `registros` row.

**Separate, more severe finding surfaced while investigating this**: since
`registrarProducto()`'s `snom` (the product name, e.g. "Cera Modeladora
Fuerte") is checked by the exact same `resolverServicioYValidarPrecio()` gate
`POST /registros` applies to every submission (see
[TECH_DEBT.md](../TECH_DEBT.md), "Servicio especial ... is completely
non-functional since 2026-07-17"), and no product name will ever match a
`servicio_alias`, **every product sale through this path has likely been
silently failing to sync since the catalog validation went live** — confirmed
empirically: zero rows in `GET /registros/dia` across 2026-07-28 through
2026-08-03 match any of the four real product IDs/names. This is tracked as
its own separate TECH_DEBT.md entry, not folded into this design, but it's
directly relevant context: **any new "attach product to ticket" write path
must also send `override:true`/`override_reason` (per the Option A work in
`feature/variable-pricing-override`) or it will hit the identical permanent
failure the moment it's built.**

---

## 2. Candidate approaches

### Option A — additive `ticket_id`/`grupo_id` column on `registros`

```sql
ALTER TABLE registros ADD COLUMN ticket_id TEXT; -- nullable, no default
CREATE INDEX IF NOT EXISTS idx_registros_ticket_id ON registros (ticket_id) WHERE ticket_id IS NOT NULL;
```

Every existing row's shape is untouched. A service row and one or more
product rows sold alongside it share the same `ticket_id` (e.g. the `queue_id`
or the service registro's own `id`) but otherwise remain completely normal,
independent `registros` rows — same columns, same `bid`/`snom`/`precio`/`bb`/
`neg` per row.

**Pros:**
- Every existing consumer that reads `registros` row-by-row (see the
  inventory in §3) keeps working **completely unmodified** — a query that
  doesn't know `ticket_id` exists still sees the exact same rows it always
  did, just now with an extra nullable column it ignores.
- Financial totals (facturación, KPIs, commission) are already computed by
  summing/counting individual rows — grouping is purely a *display* concern
  layered on top, not a computation change, unless César wants grouped
  commission logic (see open question #2 below).
- Low implementation cost: one migration, one new column threaded through
  the two write paths that need to set it, and an opt-in "group by
  ticket_id" step in whichever report/UI wants to visually merge lines.
- Reversible: if it doesn't work out, the column can just stop being
  populated/read — no data to migrate back.

**Cons:**
- Doesn't fix the underlying "one row = one flat fact" shape — if César later
  wants richer per-line-item semantics (e.g. a discount that applies to the
  whole ticket, not per line, or a single payment method split across
  service+product that doesn't cleanly decompose into independent `pago`
  values per row today), this column doesn't provide that on its own.
- `ticket_id` as a bare text column has no referential integrity — nothing
  stops two unrelated rows from accidentally sharing an id, or a typo'd id
  silently creating an orphaned group of one. Would need a lightweight
  validation convention (e.g. always derived from a real `queue_id` or a
  fresh UUID minted at ticket-open time, never hand-typed) rather than a
  hard DB constraint, since there's no natural "tickets" parent row to
  foreign-key against under this approach.

### Option B — proper line-items model (`tickets` + `ticket_items`)

```sql
CREATE TABLE tickets (
  ticket_id   TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  bid         TEXT NOT NULL,
  bnom        TEXT NOT NULL,
  cliente_id  TEXT,
  fecha       DATE NOT NULL,
  hora        TIME NOT NULL,
  pago        TEXT NOT NULL,
  estado      TEXT,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE ticket_items (
  id          SERIAL PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets(ticket_id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('servicio','producto')),
  sid         TEXT,
  snom        TEXT NOT NULL,
  precio      INTEGER NOT NULL,
  com         NUMERIC,
  bb          INTEGER,
  neg         INTEGER
);
```

`registros` would either become a compatibility view (`SELECT ... FROM
tickets JOIN ticket_items ...` shaped to look like today's flat rows) or be
phased out entirely over time in favor of consumers querying `tickets`/
`ticket_items` directly.

**Pros:**
- Architecturally correct long-term shape — a ticket genuinely has zero or
  more line items, payment is a property of the ticket not each line,
  discounts/taxes could attach at the right level, and it matches how every
  real POS system models this.
- Removes the need for hacks like the `service` text-concatenation pattern
  ("Corte + Barba") that "Agregar servicio extra" already uses — a second
  service becomes a second `ticket_items` row with its own real `sid`/`precio`,
  not a string smashed into one field.

**Cons — much larger, riskier migration:**
- Every consumer in §3 that does `SELECT ... FROM registros` (or a raw
  `snom`/`precio`/`bb` per row) either needs to be rewritten against the new
  tables, or `registros` needs to become a view that perfectly reproduces
  today's row shape for every existing query — including the exact semantics
  of `com`/`bb`/`neg` per row, `estado`, `idempotency_key`-based dedup, the
  `sid LIKE 'p%'` convention the productos design doc already leans on for
  facturado_servicios/facturado_productos splitting, and three *different*
  write paths (`POST /registros`, `POST /registros/bulk`,
  `POST /queue/control/registrar`, plus barber-app writes via
  `BarberPilot_App/src/services/api.js`'s `api.registrar()`) that would all
  need to target the new shape identically.
- Touches historical data semantics: is a pre-migration `registros` row
  retroactively a `tickets` row with exactly one `ticket_items` row, or does
  it stay in the old table forever alongside the new one? Either choice has
  real consequences for every historical report (KPIs, `/stats/mes` feeding
  Looker Studio, monthly barber summaries).
- Much bigger surface for something to go subtly wrong in a live financial
  system — the kind of change this project's CLAUDE.md explicitly flags for
  extra caution (production data, billing, user-facing state).

**Recommendation**: Option A is the more promising starting point — it
solves César's actual stated need (attach a product to an open ticket)
without touching how every other part of the system already reads
`registros`, and doesn't foreclose a later Option-B migration if the need for
richer line-item semantics (per-line discounts, split payments) becomes real.
The blast-radius inventory below is for Option A.

---

## 3. Consumer inventory (Option A) — who needs to change vs. who doesn't

Grepped `registros` across every repo present on this machine:
barberpilot-api, barberpilot-control, sf-live, sf-docs, BarberPilot_App
(plus livedata-control, saulfino-web, repos/ — no hits beyond node_modules
build artifacts and static doc/JSON snapshots).

### Needs to change (to actually implement Option A)

| File / endpoint | What changes |
|---|---|
| barberpilot-api schema | New migration: `ALTER TABLE registros ADD COLUMN ticket_id TEXT` + partial index |
| `POST /queue/control/registrar` ([index.js:3723](../../barberpilot-api/index.js#L3723)) | Set `ticket_id` on the service row it inserts (e.g. to its own `regId`, so a product attached later can reference it) |
| **New** `POST /registros` (or a new dedicated route) call from `registrarProducto()` | Needs a `ticket_id` in the payload — requires the checkout UI to know which open ticket it's attaching to (see open question #1) |
| `registrarProducto()` ([index.html:2168](../index.html#L2168)) | Needs a UI affordance to pick "attach to ticket X" vs. "new standalone sale" (today it only ever does the latter) |
| `POST /registros` write-time validation ([barberpilot-api/index.js:1412](../../barberpilot-api/index.js#L1412)) | Must always send `override:true`/`override_reason` for the product-attach path too (see §1's separate finding) — otherwise this reproduces the exact same permanent-failure bug for every attached product |
| Any NEW report/UI that wants to *visually* merge a service+product into one displayed line | Opt-in `GROUP BY ticket_id` (or client-side grouping of the flat rows) — genuinely new code, not a modification of existing reports |

### Keeps working completely unmodified

| Consumer | Why it's unaffected |
|---|---|
| `GET /registros/dia` / `GET /registros/rango` ([barberpilot-api/index.js:1658](../../barberpilot-api/index.js#L1658), [1686](../../barberpilot-api/index.js#L1686)) | Selects the same existing columns; a new nullable column they don't select changes nothing |
| `GET /resumen`, `GET /admin/resumen`, `GET /kpi/:periodo`, `GET /kpi-evaluaciones/:periodo`, `GET /stats/mes/:periodo` (Looker Studio source), `GET /barbero/:bid/hoy`, `GET /barbero/:bid/mes/:periodo`, `GET /pendientes`, `GET /clientes/lookup` | All aggregate/read individual rows by existing columns (`fecha`, `bid`, `precio`, `bb`, etc.) — row-level facts don't change, only an unused new column appears |
| `PATCH /registros/:id/pago`, `PATCH /registros/:id/cliente`, `PATCH /registros/:id/estado`, `DELETE /registros/:id` | Operate per-row by `id`, unaffected by grouping |
| barberpilot-control's local `regs` array, `cargarRegistrosDia()`, `printTicket62`/`printCierre58mm`/`generarHTMLA4`/`renderCaja`/`renderCierreA4`/`renderResumenFinal` | All read the same flat row shape from `GET /registros/dia`; nothing here currently groups by anything, so nothing breaks |
| `dashboard_kpis_barberia.html` ("Dashboard de Socios") | Reads `GET /registros/dia`/`GET /registros/rango` directly, same shape |
| `sf-live/index.html` (`cargarRegistrosDetalle`, `procesarRegistros`) | Reads `GET /registros/dia`, processes a flat row list for heatmaps/analytics — no grouping concept to break |
| `BarberPilot_App` — `HoyScreen.js`, `MesScreen.js`, `AdminScreen.js`, `ConfigScreen.js`, `SocioScreen.js`, `TendenciasScreen.js`, `LiquidacionScreen.js`, and `src/services/api.js`'s `hoy()`/`mes()`/`ranking()` | All consume the read endpoints above; row shape unchanged |
| `BarberPilot_App` — `RegistrarScreen.js`, `PaymentSheet.js` (`api.registrar()` → `POST /registros`) | Continue writing standalone rows exactly as today — they simply never set `ticket_id`, which is fine since it's nullable |
| Historical one-off `UPDATE registros SET ...` migration statements ([barberpilot-api/index.js:7103](../../barberpilot-api/index.js#L7103), [7135](../../barberpilot-api/index.js#L7135)) | Already-executed, one-time data fixes — not ongoing consumers |

### Not found / could not verify

- No "Reporte Semanal React component" was found in any repo present on this
  machine (barberpilot-api, barberpilot-control, sf-live, sf-docs,
  BarberPilot_App, livedata-control, saulfino-web, repos/). It may live in a
  repository not checked out here, under a different name, or not exist yet
  — flagging rather than guessing.
- `dashboard_facturacion` appears only as a label/comment in
  barberpilot-control's KPI section ([index.html:4778](../index.html#L4778),
  [5013](../index.html#L5013), [5030](../index.html#L5030)) referencing an
  external plan/reference document as the source of truth for revenue goals
  — it is not a live code consumer of `registros` in any repo checked, so
  there's nothing to update on this front for Option A.

---

## 4. Open questions for César

1. **How does the checkout UI know which ticket to attach to?** Today
   `registrarProducto()` has no concept of "an open ticket" at all — it's a
   standalone sidebar flow. Does "attach to ticket" mean: attach to the
   currently-open Sala de espera entry for a selected barber/client (most
   natural, reuses `queue_id`), or does it need to support attaching to a
   service that was *already closed* minutes ago (i.e. the client already
   paid for the haircut and comes back to the register for a product before
   leaving)? These have different UX and different `ticket_id` sourcing.
2. **Should a grouped ticket show as one line or multiple lines in existing
   daily/weekly reports?** Option A doesn't change any existing report's
   output by default (every row still displays independently) — grouping is
   opt-in. Does César want the *existing* "Registros del día" list and
   Cierre de caja reports to start visually merging same-`ticket_id` rows, or
   should that only appear in a new, separate view?
3. **Should barber commission calculations treat an attached product sale
   differently from a standalone one?** Today `registrarProducto()` uses a
   flat `COM_PRODUCTO` rate regardless of context. If a product is sold
   *because* it was attached to an in-progress service (barber actively
   upsold it), should commission differ from a walk-in product-only sale? If
   not, no commission-logic change is needed at all under Option A — this is
   purely a "does the grouping carry any financial meaning beyond display"
   question.
4. **Does the override/reason requirement (§1) apply to every product
   attached to a ticket, or only ones with a genuinely custom price?** Since
   product names will never match a `servicio_alias` (products aren't
   serviced by that table at all), literally every product sale currently
   hits `alias_no_mapeado`. Does fixing *that* (a separate, already-flagged
   TECH_DEBT item) need to land before or alongside this feature, since
   otherwise every newly-attached product sale would fail to sync the same
   way standalone ones already silently have been?

---

## 5. Confirmed decisions (2026-08-03) — resolves §4

**Approach**: Option A confirmed (additive `ticket_id` column, per the
recommendation and blast-radius inventory above).

**Commission** (resolves open question #3): a product attached to a service
gets a **flat 10% to the barbero** (`bb = round(precio * 0.10)`,
`neg = precio - bb`), **independent of `pago`** — unlike services, which vary
50%/43%/50% by payment method. This applies **only** when a product is
explicitly attached to a service on the same ticket. Standalone product
sales (`registrarProducto()`, no attachment) are **completely unaffected** —
confirmed by re-reading that code as part of this decision
([index.html:2093-2117](../index.html#L2093-L2117)): it already computes
`bb = b ? Math.round(total*COM_PRODUCTO) : 0` with `COM_PRODUCTO = 0.10`
flat, with **no `pago`-based branching at all** — the "new" attach-only rule
is numerically identical to what standalone sales already do whenever a
barbero is assigned. There is no collision to resolve; the only real
difference is that an attached product will always have a barbero (the one
performing the service), so `bb` is never the `bid:'none'`-triggered zero
case standalone sales allow. **Forward-only** — no retroactive correction of
past product sales.

**Question #1 (which ticket to attach to)**: resolved to the more natural
case — attach only while a service is **still open** in Sala de espera
(before checkout). No support (yet) for attaching to an already-closed
ticket; that's a different, larger UX problem (finding a past ticket,
re-opening it) not in scope here. Implementation: the attach action is a
**local, client-side staging step only** — no network call per attach.
Staged products live in `_salaEditorData[queue_id].productosAdjuntos`
(an array), and are sent as `productos_adjuntos: [{producto_id, cantidad}]`
in the existing `salaCerrarServicio()` → `POST /queue/control/registrar`
call at actual checkout time. This means the service registro and every
attached product registro are created in the same request, sharing
`ticket_id` — matching "created together" from the expected flow.

**Question #2 (grouped display in reports)**: not addressed by this
implementation — remains true to the Option A default: every row still
displays independently in "Registros del día," Cierre de caja, etc.
Visually merging same-`ticket_id` rows into one displayed line is optional,
future, separate UI work — nothing here requires it, and nothing here
prevents it later.

**Question #4 (alias/override validation)**: resolved by **not routing
attached products through `resolverServicioYValidarPrecio()`/`servicio_alias`
matching at all.** Attached products are referenced by their real
`producto_id` (an exact catalog lookup against `productos`/
`tenant_producto_precios`, sourced from the PR #18 live catalog) — there is
no free-text name to fuzzy-match, so the `alias_no_mapeado` failure mode
that made "Servicio especial" and standalone product sales permanently
un-syncable simply doesn't apply to this new path. This resolves the
question by sidestepping it, not by deciding whether the *existing*
standalone-product sync bug (still tracked separately in `TECH_DEBT.md`)
needs fixing first — it doesn't, for this feature specifically, since this
is a different, ID-based write path.

---

## 6. Addendum 2026-08-03 — Persisting attached products before checkout (DESIGN ONLY)

Status: proposed, awaiting approval before implementation. PR #21 shipped
"Adjuntar producto" with attachment as **local, client-side staging only**
(§4, Question #1) — this was a deliberate, explicit scope decision at the
time, not an oversight, but the owner's real usage surfaced a gap: staged
products live only in one browser tab's memory
(`_salaEditorData[queue_id].productosAdjuntos`) and are invisible to
anyone else looking at the Sala de espera card, don't survive a page
reload, and give no durable confirmation that they "took." Clicking
"Actualizar servicio" — the only other save-labeled action in the same
editor modal — does nothing with them, which is what actually surfaced
this (confirmed as expected-per-original-design, not a bug, in the prior
investigation).

**Explicitly unchanged**: commission timing. Attaching a product to an
open ticket still creates **no** `registros` row and triggers **no**
commission calculation — that remains exclusively a checkout-time effect
of `POST /queue/control/registrar`'s existing `productos_adjuntos`
handling (PR #29), untouched by anything below.

### a. Schema

```sql
-- Migration 040 — queue.productos_adjuntos: server-persisted staging for
-- products attached to a still-open ticket, before checkout. Nullable-free
-- (NOT NULL DEFAULT '[]'::jsonb) — same idiom as barberos.whatsapp_
-- notificaciones (Migration 036): empty array reads unambiguously as
-- "nothing attached," no null-checking needed anywhere that reads it.
ALTER TABLE queue ADD COLUMN IF NOT EXISTS productos_adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb;
```

Stored shape: `[{producto_id, cantidad}]` — deliberately **minimal**, not
denormalized with `nombre`/`precio`. Names are resolved fresh from
`productos` on every read (see §c) rather than snapshotted at attach time,
for the same reason `resolverProducto()` always re-resolves rather than
trusting a client-cached value: a product could be renamed or deactivated
between attach and display/checkout, and a stale denormalized name would
silently drift from the catalog. This exactly mirrors how `queue.service`
already works today for the *base* service (stored as the raw string typed
at check-in, not a servicio_id) — no new pattern introduced, just applied
consistently to the one field that has a real catalog to resolve against.

### b. Endpoint — extend `PUT /queue/:id`, not a new route

Justification: `PUT /queue/:id` is already this codebase's general-purpose
"update fields on an open queue entry" endpoint (`service`, `client_name`,
`phone`, `barber_id`, each independently optional via
`COALESCE($n, column)`). Adding `productos_adjuntos` as one more
optionally-COALESCEd field fits that existing shape directly — a new
dedicated route (`PUT /queue/:id/productos` or similar) would just be a
second place to look for "how does an open ticket get updated," with no
technical reason to split it out (no different auth, no different
transaction boundary, no different entry being mutated).

Whole-array replace, not add/remove-by-item server-side — same reasoning
already established for `PATCH /config/bebidas-disponibles`
([index.js:1148-1156](../../barberpilot-api/index.js#L1148-L1156)): "the
frontend list UI always sends the full current list back, simpler than
diffing add/remove operations server-side for an array this small." The
frontend already holds the authoritative in-progress list in memory when
the user clicks "＋" or "✕" on one item — sending the whole array each
time costs nothing extra and avoids needing any merge/diff logic here.

```js
// PUT /queue/:id — extend existing handler, additive
const { service, client_name, phone, barber_id: rawBid, productos_adjuntos } = req.body;
...
let productosJson = null; // null → COALESCE leaves the column untouched
if (productos_adjuntos !== undefined) {
  if (!Array.isArray(productos_adjuntos)) {
    return res.status(400).json({ ok: false, error: 'productos_adjuntos debe ser un array' });
  }
  const resueltos = [];
  for (const item of productos_adjuntos) {
    const productoId = item && item.producto_id;
    const cantidad = Math.max(1, parseInt(item && item.cantidad) || 1);
    if (!productoId) return res.status(400).json({ ok: false, error: 'producto_adjunto_sin_id' });
    // Existence + active only — same resolverProducto() already proven in
    // PR #29/#30, called WITHOUT a precio argument so its price-match
    // check (added post-review on PR #30) never engages here. Nothing
    // about price or commission is validated or computed at this stage —
    // that stays exclusively at checkout, unchanged.
    const resolucion = await resolverProducto('saulfino', productoId);
    if (resolucion.estado === 'producto_no_encontrado') {
      return res.status(404).json({ ok: false, error: 'producto_no_encontrado', producto_id: productoId });
    }
    if (resolucion.estado === 'producto_inactivo') {
      return res.status(400).json({ ok: false, error: 'producto_inactivo', producto_id: productoId, detalle: `"${resolucion.nombre}" está desactivado` });
    }
    resueltos.push({ producto_id: productoId, cantidad });
  }
  productosJson = JSON.stringify(resueltos);
}
// ... existing UPDATE, extended:
//   productos_adjuntos = COALESCE($N::jsonb, productos_adjuntos)
// same COALESCE-when-provided pattern as service/client_name/phone/barber_id —
// a PUT that only touches client_name (e.g. salaGuardarCliente()) must not
// accidentally wipe whatever's already attached.
```

Reuses `resolverProducto()` as-is (barberpilot-api#30, merged) — no changes
needed to that function for this addendum.

### c. `renderSala()` card display

`GET /queue/control` already does `SELECT * FROM queue ...`, so
`productos_adjuntos` (raw `[{producto_id,cantidad}]`) is already on every
row with zero query change. What's missing is name resolution before
building the `entry` objects the frontend consumes. Proposed: one batched
lookup per request (not one query per queue row) —

```js
// After the existing `const { rows } = await query('SELECT * FROM queue ...')`:
const productoIds = [...new Set(rows.flatMap(e => (e.productos_adjuntos || []).map(p => p.producto_id)))];
let productoNombres = {};
if (productoIds.length > 0) {
  const { rows: prodRows } = await query(
    `SELECT producto_id, nombre FROM productos WHERE tenant_id='saulfino' AND producto_id = ANY($1)`,
    [productoIds]
  );
  productoNombres = Object.fromEntries(prodRows.map(p => [p.producto_id, p.nombre]));
}
// ...then, building each `entry` object, add:
//   productos_adjuntos: (e.productos_adjuntos || []).map(p => ({
//     producto_id: p.producto_id, cantidad: p.cantidad,
//     nombre: productoNombres[p.producto_id] || '(producto no encontrado)',
//   })),
```

Applied uniformly to every entry (`enServicio`, `enEspera`, `pool`) since
the column exists on every `queue` row regardless of status — no
special-casing needed, and it doesn't preclude attaching before a ticket
formally enters "EN SERVICIO" if that's ever wanted later, even though
today's editor UI only exposes attach on in-service cards.

Frontend `renderSala()` card text becomes, e.g., `"Corte + Cera Modeladora
Media"` — same `" + "` join convention the (now-removed) "Agregar servicio
extra" used for combining two services, reused here for combining a
service with its attached product(s):

```js
var svcLabel = sv.service + (sv.productos_adjuntos && sv.productos_adjuntos.length
  ? ' + ' + sv.productos_adjuntos.map(function(p){
      return (p.cantidad>1?p.cantidad+'x ':'')+p.nombre;
    }).join(' + ')
  : '');
```

This replaces (not supplements) the current small "🧴 +N productos · $X"
badge PR #21 added below the Cerrar button — with the combined text now
in the main service line, a separate badge saying the same thing again is
redundant. (Precio subtotal for attached products, if wanted in the UI at
this stage, can still be shown alongside — this addendum doesn't propose
removing that, just consolidating the *name* display into one line.)

### d. Checkout sourcing — backend becomes the source of truth, not the request body

This is the one place this addendum recommends a real behavior change
beyond "add persistence," and it's worth flagging explicitly rather than
folding in quietly: **`POST /queue/control/registrar` should read
`productos_adjuntos` from the `queue` row it already fetches
(`SELECT * FROM queue WHERE id=$1`, [index.js:3729](../../barberpilot-api/index.js#L3729)),
not from `req.body.productos_adjuntos`.**

Why: the task's own requirement is "a ticket attached-to on one
device/tab and closed from another still works correctly." If checkout
keeps trusting whatever the *closing* device's local
`_salaEditorData[...].productosAdjuntos` happens to hold, a second
device that never attached anything locally would checkout with an empty
array even though the server has the real, persisted list — reintroducing
the exact "wrong device doesn't know" problem this addendum exists to
close. Sourcing from `entry.productos_adjuntos` (the row already in hand,
zero extra query) instead makes the server the single source of truth,
consistent with this project's "no silent duplication of the same source
of truth" standard — there would otherwise be two candidate answers to
"what's attached to this ticket" (the DB column vs. whatever the closing
tab's memory holds) that could silently diverge.

Concretely: the loop that currently reads `req.body.productos_adjuntos`
in `POST /queue/control/registrar`
([index.js:3801-3831](../../barberpilot-api/index.js#L3801-L3831)) changes
its source array to `entry.productos_adjuntos`; everything downstream —
`resolverProducto()` validation, the flat-10% commission math, the
per-product `registros` INSERT sharing `ticket_id` — is **completely
unchanged**, since it already operates on a resolved `{producto_id,
cantidad}` array regardless of where that array came from. The frontend's
`salaCerrarServicio()` no longer needs to build/send a
`productos_adjuntos` body field at all (though leaving it accepted-but-
ignored costs nothing if it simplifies rollout sequencing).

After a successful checkout, `queue.productos_adjuntos` should reset to
`'[]'::jsonb` in the same statement that sets `status='DONE'` — its job is
done, and leaving stale data there risks confusing a future read of that
row (e.g. if a `queue_id` is ever reused/inspected historically).

**Already covered, not a new gap**: a product deactivated between attach
and checkout is still caught — `resolverProducto()` runs again at checkout
time regardless of which array feeds it, same `producto_inactivo` 400
that exists today.

### What this makes obsolete (net simplification, not just addition)

`renderSala()`'s `_prevProductosAdjuntos` snapshot/restore logic
(added to survive its own 20s refresh, [index.html:6129-6132](../index.html#L6129-L6132))
becomes unnecessary once the server is the source of truth — every refresh
re-fetches the current *persisted* state rather than needing to preserve
an *ephemeral* one across a reset. Proposed removal as part of Step 2, not
kept alongside the new mechanism.

### Risk / edge cases

- **Concurrent-edit race**: two staff editing the same ticket's products
  from different devices at once — whole-array-replace is last-write-wins,
  no optimistic locking. This is an *existing* risk class already accepted
  for every other field this same endpoint updates (`service`,
  `client_name`, etc.) — not a new regression, and not proposed to be
  solved here; flagging so it's a deliberate non-goal, not an oversight.
- **Migration numbering**: this would be Migration 040 (039 was
  `registros.ticket_id`, currently the latest merged).

### Open question for the owner

Confirm the §d checkout-sourcing change (server-authoritative, ignoring
`req.body.productos_adjuntos` at checkout) is wanted as described, since
it's the one piece of this addendum that's a genuine behavior change
rather than pure addition — everything else (schema, PUT validation, card
display) is purely additive and reversible with zero risk to the existing,
already-verified checkout flow.
