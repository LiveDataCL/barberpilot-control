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
