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

## 2026-08-03 — Product sales via the checkout sidebar have likely been silently failing to sync since 2026-07-17

**Description**: `registrarProducto()` ([index.html:2168](index.html#L2168))
sends the product name as `snom` through the exact same `POST /registros`
write-time validation gate as services (`resolverServicioYValidarPrecio()`,
barberpilot-api `index.js:1420-1481` — see the "Servicio especial" entry
above for the full mechanism). Product names ("Cera Modeladora Fuerte",
"Champú 2 en 1 (Biotina)", etc.) are matched against `servicio_alias`, a
table that only ever contains haircut/barba service phrases — a product
name will essentially never match. Before today's fix (barberpilot-api#28),
`alias_no_mapeado` was a hard, unconditional reject with no override path at
all, so **every product sale through this path would 400 permanently and
sit stuck in `bp_outbox` forever**, identical in shape to the "Servicio
especial" bug but affecting a different, more heavily-used feature.

Confirmed empirically, not assumed: cross-referenced `GET /registros/dia`
against the real production API for 2026-07-28 through 2026-08-03 (the week
before this was found) — zero rows matched any of the four real product IDs
(`p01`, `p02`, `p05`, `p06`) or names from the live catalog
(`GET /config/negocio/publico?tenant=saulfino`), despite the products
catalog being live and PR #18 having just wired the checkout UI to it. This
is strong circumstantial evidence the failure is real and ongoing, not
theoretical — but it has not been confirmed against an actual browser's
`bp_outbox` localStorage on the register, since that requires physical
access to the device.

`registrarProducto()` was **not** updated to send `override`/
`override_reason` as part of today's fix (that PR only touched the sidebar's
"SERVICIO PERSONALIZADO" custom-service flow) — product sales through this
path will continue failing identically until this is addressed separately.

**Why deferred**: Discovered as a side effect of investigating the
"Servicio especial" bug, not something this task was scoped to fix.
Fixing it needs its own decision: either (a) have `registrarProducto()`
also always send `override:true`/`override_reason` (same mechanism, quick),
or (b) exempt product-shaped `snom`/`sid` values from the
`servicio_alias`-based validation entirely at the backend (arguably more
correct, since a product was never a "service" to begin with and shouldn't
need a price-override justification for being, definitionally, not in the
services catalog) — that decision should be made deliberately, not
defaulted into by reusing whatever Option A ships for services.

**Severity**: High — if confirmed, this means product revenue recorded
locally in the panel may not exist in the production database at all,
which is a real financial/reporting gap (not just a UI annoyance), for
however long products have been sold through this path.

**Urgency**: Immediate, pending confirmation — needs to be verified against
a real register's `bp_outbox` localStorage (or production logs, if
available) to convert "strong circumstantial evidence" into a confirmed
diagnosis before scoping a fix, same discipline as the "Servicio especial"
DB-check in the original investigation.

**Status**: Open. Not yet fixed — flagged prominently, no code change made
under this entry.
