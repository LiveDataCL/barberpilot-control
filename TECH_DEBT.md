# Tech Debt Registry — barberpilot-control

## 2026-08-01 — Sala de espera's client-autocomplete index caches name+phone+visit history in localStorage with no forced eviction

**Description**: The new phone-autocomplete widget on the "Sala de espera" tab
(`salaCargarIndiceClientes`/`salaActualizarIndiceCliente` in `index.html`)
fetches the full tenant client list (`GET /clientes`, panel-authenticated)
once per tab load and caches a reduced copy — `id`, `nombre`, `telefono`,
`ultimo_barbero`, `ultimo_servicio`, `ultima_bebida`, `ultima_visita` — in
`localStorage` under `sfsf_cliente_idx`, with a 10-minute staleness TTL
(stale-while-revalidate: an expired-but-present cache is still read
instantly, then silently refreshed in the background). The TTL only governs
when a background refetch happens — it does not evict or expire the
`localStorage` entry itself. On a shared/staff counter device, this means
~500 clients' name, phone number, and last-visit summary persist in browser
storage indefinitely (until the next successful fetch overwrites the key),
independent of panel login/logout.

**Why deferred**: This is the explicit design requested for the feature (fast
client-side filtering with zero network calls per keystroke requires a local
cache) — building a more elaborate storage story (e.g. clearing the cache on
panel logout, encrypting it, or moving it to an in-memory-only cache that's
refetched every tab load) was out of scope for this task and would trade
away the instant-on-reload benefit stale-while-revalidate is meant to give.
Notably, `notas`/`cumpleaños` (the more sensitive staff-only fields `GET
/clientes` also returns) are deliberately excluded from the cached shape via
`_salaReducirCliente` — only name/phone/last-visit summary are persisted.

**Severity**: Low — the data (client name, phone, last barber/service/drink)
is the same data already shown in-app to any panel-authenticated staff
member; the gap is storage *persistence*, not new *exposure*. Notas and
cumpleaños (higher-sensitivity fields) are explicitly excluded.

**Urgency**: Monitor-only — revisit if counter devices are ever shared with
non-staff, or if a compliance requirement around client PII retention in
browser storage comes up.

**Status**: Open.

## 2026-08-03 — "Servicio especial" (custom-priced service) sidebar feature is completely non-functional since 2026-07-17

**Description**: Any entry made via the sidebar's "SERVICIO PERSONALIZADO"
field (`customNombre`/`customPrecio` inputs, `registrar()` in `index.html`)
always fails validation on `POST /registros` in barberpilot-api and is
permanently stuck in that browser's `bp_outbox`, retrying every 30s forever
with no visible resolution path and no way to auto-recover:
- A typed name matching an existing catalog alias (`servicio_alias`) but at
  a different price → rejected via `precio_no_coincide`. The sidebar flow
  never sends `override`/`override_reason`, and the outbox retry loop has no
  UI to prompt for them, so this never self-resolves.
- A typed name not matching any alias at all → rejected via
  `alias_no_mapeado`, same permanent-failure shape.

This has been broken since the `servicios`/precio write-time validation went
live with the July 17 price launch (barberpilot-api commit `6c57aab`,
`docs/july16_price_change_migration.sql`) — the "Servicio especial" field
itself predates that change and used to work fine (bare price-range
validation only, `servicios` table was empty so the catalog-matching gate
no-opped) before that gate was added. Confirmed structural via a real
incident on 2026-08-01: an owner-entered "Corte" at a discounted $10,000
(catalog active price $13,000) stuck permanently in the outbox; the same
real-world service only reached the database because the owner separately
re-entered it via Sala de espera, a different write path (see below).

**Separate finding, same area**: `POST /queue/control/registrar` (the Sala
de espera checkout path, barberpilot-api `index.js:3759`) calls the same
`resolverServicioYValidarPrecio()` function but only acts on
`servicio_inactivo` — it never checks or enforces `precio_no_coincide` at
all. So the two paths that both ultimately write to `registros` enforce
opposite rules for the same underlying business rule ("price should match
catalog unless justified"): the sidebar/outbox path is too strict with no
override mechanism, while the Sala de espera path has no price guard
whatsoever. This should be resolved as one consistent design — a real
override/discount-authorization mechanism available on both paths with
equivalent scrutiny — not patched separately per path.

**Why deferred**: Root cause confirmed via code trace + live production
verification (2026-08-03 investigation), but no fix has been written yet —
documenting first per this project's "verify, then wait for review" gate
before any validation code changes.

**Severity**: Medium — real money/pricing logic is affected (a discounted
or negotiated service can silently never reach the database), but there is
a working manual workaround today: re-entering the same service via Sala de
espera succeeds (confirmed it records the actual charged price, not a
catalog default).

**Urgency**: Near-term, pending input — flagged to César on how often
"Servicio especial" custom pricing is actually used in practice. If it's
used regularly, this should move to Immediate, since it will keep silently
failing on every single use until fixed.

**Status**: Resolved via removal, not the override mechanism. An
override/reason mechanism (barberpilot-api#28, barberpilot-control#19) was
built and tested against this exact bug, but the business owner decided
against keeping "Servicio especial" at all — both PRs were closed unmerged
2026-08-03 (branches kept for reference/rollback:
`feature/variable-pricing-override` in both repos). The feature itself is
being removed in `fix/remove-servicio-especial` (draft PR, unmerged as of
2026-08-03). Once that merges, this entry closes as
resolved-by-removal rather than resolved-by-fix — the underlying
`alias_no_mapeado`/`precio_no_coincide` asymmetry between `POST /registros`
and `POST /queue/control/registrar` documented above still exists in the
backend generally (nothing else currently exercises it now that the one
caller that hit it is gone), so it's left here as a structural note rather
than deleted outright.

## 2026-08-03 — Product sales via the checkout sidebar were silently failing to sync — CONFIRMED LIVE, fix implemented

**Description**: `registrarProducto()` ([index.html:2168](index.html#L2168))
sends the product name as `snom` through the exact same `POST /registros`
write-time validation gate as services (`resolverServicioYValidarPrecio()`,
barberpilot-api `index.js:1420-1481` — see the "Servicio especial" entry
above for the full mechanism). Product names ("Cera Modeladora Fuerte",
"Champú 2 en 1 (Biotina)", etc.) are matched against `servicio_alias`, a
table that only ever contains haircut/barba service phrases — a product
name will essentially never match, so `alias_no_mapeado` — a hard,
unconditional reject with no override path — fires on every attempt,
**every product sale through this path 400s permanently and sits stuck in
`bp_outbox` forever**, identical in shape to the "Servicio especial" bug.

**Confirmed live 2026-08-03**, not just circumstantial: a stuck `bp_outbox`
item from the owner's own console — `sid:"p02"`, `snom:"Cera Modeladora
Fuerte"`, correct flat-10% commission math, `status:"pending"`,
`attempts:33`, `last_error:"HTTP 400"`. Verified via `GET /registros/dia`
that this exact item never reached the database.

**Full historical scope, corrected**: the original "since 2026-07-17"
framing was based on a one-week check and was too narrow. Querying
`GET /stats/mes/:periodo` across 2026-05 through 2026-08 found **12 product
sales that DID succeed** (4 in June, 8 in July, the last on 2026-07-24 —
mostly under barbero b3/Samuel, since deactivated), all with the genuine
live-checkout `id: TK<epoch>` format (not the "Ingresar histórico" backfill
tool's `TK_MAN_` format — confirmed that tool never touches this validation
path at all: `descargarHistorico()` only builds a client-side downloadable
JSON with zero API calls, and the README's manual-import path,
`POST /registros/bulk`, has no validation of any kind). **Zero product
sales have succeeded in all of August.** The exact cutover date between
"gate was permissive" and "gate started rejecting products" sits somewhere
between 2026-07-24 and 2026-08-01 — not pinned down further; no `servicio_alias`
table read access to confirm precisely, and not worth guessing beyond the
evidence.

This is very likely why the owner believed past product sales succeeded —
a stuck outbox item shows as an unremarkable "pending" count, never the red
"Error de sync" badge (that only fires once `attempts>=5` **and** the item
independently gets flagged `status:'error'`; HTTP-level rejections that
stay `status:'pending'` forever — like this one, 33 attempts in — never
escalate to the visible badge at all).

**Fix**: `fix/validate-product-registros-by-catalog` (barberpilot-api,
draft, unmerged as of 2026-08-03). Adds a `resolverProducto()` helper
(shared with PR #29's `productos_adjuntos` handling, avoiding a second copy
of the same lookup) that checks whether `POST /registros`' `sid` matches a
real `producto_id` **before** falling into the `servicio_alias` matcher —
if it does, resolve as a product (existence + active-only, no price-match
enforcement, deliberately — see the PR for why) and skip the service-only
alias logic entirely. Normal service registro validation is provably
untouched (diff shows the existing `if(catalogRows.length>0){...}` block's
body moved into an `else`, zero lines inside it changed). No frontend
change needed — confirmed `registrarProducto()` already sends the real
`producto_id` as `sid`. Once deployed, the currently-stuck item (and any
other silently-pending product sales on any device) self-heal automatically
on their next retry — `drainOutbox()` retries both `pending` and `error`
items every 30s, on page load, on reconnect, and on panel login; no manual
`localStorage` cleanup needed per device, though a device does need its tab
open/reloaded at some point for its own stuck items to retry.

**Why deferred**: Not deferred any further — implemented same-day once
confirmed live and quantified. Kept as an open TECH_DEBT entry only until
the PR actually merges and deploys.

**Severity**: High — confirmed, not hypothetical: product revenue recorded
locally in the panel did not exist in the production database for every
sale attempted since the cutover (~2026-07-24 to 08-01 onward).

**Urgency**: Immediate — fix implemented, awaiting merge/deploy + visual
confirmation (same gate as every other change touching real money this
session).

**Status**: Fix implemented, in review. Not closed until
`fix/validate-product-registros-by-catalog` merges, deploys, and the
previously-stuck outbox item is confirmed to have actually synced.

## 2026-08-03 — A ticket closed via the barber app's own status endpoint bypasses attached-product billing entirely

**Description**: Found while implementing server-persisted "Adjuntar
producto" (`docs/attach-product-to-ticket-design_2026-08-03.md` §6).
There are two independent ways a `queue` row becomes `status='DONE'`:

- The panel's checkout, `POST /queue/control/registrar` — creates the
  service `registros` row, reads and bills any `productos_adjuntos`,
  computes commission, resets `productos_adjuntos` to `[]`.
- The barber app's own close action, `PUT /queue/:id/status` with
  `{status:'DONE'}` (barberpilot-api `index.js:4396`) — sets `status='DONE'`
  and does queue-position/duration-learning bookkeeping, but **creates no
  `registros` row at all** and has no knowledge of `productos_adjuntos`.

If a panel staff member attaches a product to an in-progress ticket
(cross-sell) and the barber then closes that same ticket from their own
app (via the second path) before the panel checks it out, the attached
product is never billed and never generates commission — the `queue` row
becomes `status='DONE'` (disappearing from `GET /queue/control`'s
`WHERE status != 'DONE'` filter, so it's no longer visible/actionable in
Sala de espera) with `productos_adjuntos` still populated but now
unreachable through any UI. Not cleared, not billed — just orphaned.

**Why deferred**: This is a pre-existing architectural duality (two
independent ways to close a ticket) that predates attached products
entirely — reconciling it (e.g. having the app's status endpoint also
check for and bill `productos_adjuntos`, or blocking a DONE transition
via that path while products are attached) is a larger decision about
which path should be authoritative for billing, out of scope for the
persist-attached-products task that surfaced it.

**Severity**: Medium — real commission/revenue loss if it happens, but
requires a specific sequence (product attached via panel, then the
*barber's own app* closes the same ticket before panel checkout) that may
be rare in actual usage today; not confirmed to have happened yet.

**Urgency**: Monitor-only until attached-product usage is common enough
for this sequence to plausibly occur — revisit if/when it is.

**Status**: Open.
