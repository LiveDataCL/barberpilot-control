// Configuración de ESTE negocio. Un archivo por despliegue: el código del panel no trae ningún dato de otro negocio.
// Salón Men (valores actuales, copiados del código anterior). Para un cliente nuevo este archivo se genera con scripts/generar-config-control.js.
window.BP_CONFIG = {
  diseno: "v2",   // "clasico" = el diseño de hoy; "v2" = el diseño nuevo (diseno-v2.js). Para volver atrás: "clasico" o borrar esta línea
  permitirOverrideDiseno: true,   // vista previa: con ?diseno=v2 en la dirección se ve el diseño nuevo en esa visita; sin el parámetro, nadie lo ve. Para quitarlo: false o borrar esta línea
  pantallasV2: ["shell", "registrar", "sillas", "config", "historico", "administracion", "registros", "resumen", "sala", "clientes", "agenda", "horarios", "kpis", "tv", "login", "ingresar-historico", "cierre", "aprobar"],   // pantallas que ya tienen el diseño nuevo (solo cuenta cuando diseno es "v2")
  tema: { logo: "brand/monograma-salonmen.svg", brand: { "--brand-primary": "#0E3B2E", "--brand-primary-hover": "#145040", "--brand-primary-deep": "#08261D", "--brand-primary-tint": "#E8F0EC", "--brand-primary-tint-2": "#CFE0D8", "--brand-on-primary": "#FAEBC2", "--brand-accent-ui": "#A56A30", "--brand-accent-text": "#845120", "--brand-accent-on-dark": "#C48345" } },   // colores de Salón Men (solo --brand-*)
  apiUrl: "https://barberpilot-api-production.up.railway.app",   // servidor de este negocio
  tenantSlug: "saulfino",   // identificador interno del negocio en su propio servidor
  nombre: "Salón Men",
  nombreCorto: "Salón Men",
  local: "Local 222",
  lugar: "Salón Men · Local 222",
  direccion: "Local 222 · Galería Santiago Centro",
  direccionLarga: "Galería Santiago Centro · Local 222 · Línea 1 Metro",
  reservaUrl: "https://salonmensf.livedata.cl",
  locale: "es-CL",
  timeZone: "America/Santiago",
  currency: "CLP",
  codigoPais: "56",   // prefijo de país para los enlaces de WhatsApp
  telLocalMax: 9,   // un número de hasta N dígitos se considera local y recibe el prefijo
  telefonoEjemplo: "+56 9 1234 5678",
  nombreEjemplo: "Rodrigo Villalobos",
  mostrarCreditoLiveData: true,   // "Desarrollado por LiveData" en el ingreso y en "Acerca de" (false: no aparece en ninguna parte)
  creditoLiveDataUrl: "https://www.livedata.cl",   // vacío = el crédito se ve sin enlace
  tv: true,   // pestaña TV (destinos del lanzador de la sala). Para clientes sin TV: false o borrar esta línea
  agenda: true,   // este negocio tiene la página de Agenda (agenda-admin.html); sin esta clave la pestaña Agenda no aparece
  ticketNombre: "Salón Men",   // primera línea del ticket (por defecto: nombreCorto); sin segunda línea (ticketLinea2 es opcional)
  ticketLineas: [
    "Galería Santiago Centro · Local 222",
    "Línea 1 Metro · Santiago"
  ],
  ticketCorto: "Local 222 · Gal. Santiago Centro",
  salaServicios: [
    "Corte",
    "Barba",
    "Corte + Barba",
    "Corte + Perfilado de barba",
    "Perfilado de corte",
    "Perfilado de cejas",
    "Barba + Cejas",
    "Perfilado de barba",
    "Matizado canas cabello",
    "Matizado canas barba",
    "Corte + Cejas"
  ],   // servicios del formulario de Sala de Espera (null = los del catálogo del servidor)
  salaPrecios: {
    "Corte": 13000,
    "Corte clásico": 13000,
    "Corte Clásico": 13000,
    "Barba": 10000,
    "Corte + Barba": 22000,
    "Corte + Perfilado de barba": 16000,
    "Perfilado de corte": 6000,
    "Perfilado de cejas": 4000,
    "Barba + Cejas": 13000,
    "Perfilado de barba": 6000,
    "Matizado canas cabello": 8000,
    "Matizado ganas de cabello": 8000,
    "Matizado canas barba": 5000,
    "Matizado ganas de barba": 5000,
    "Corte + Cejas": 15000
  },   // precios iniciales de Sala de Espera (el servidor los reemplaza)
  barberosRespaldo: [
    { "id": "b1", "nombre": "Didian", "active": true },
    { "id": "b5", "nombre": "Steven", "active": true },
    { "id": "b8", "nombre": "Benjamín", "active": true },
    { "id": "b7", "nombre": "Angie", "active": true }
  ],   // barberos mostrados mientras el servidor responde (vacío = ninguno)
  nombresCanonicos: {
    "b1": "Didian",
    "b5": "Steven"
  },
  mensajeResena: "¡Hola {nombre}! Esperamos que hayas disfrutado tu corte y servicio hoy en la barbería.\nNos ayuda enormemente que nos dejes una breve opinión en Google para seguir mejorando.\nPara que no pierdas tiempo pensando qué poner, aquí tienes un par de ideas sobre lo que nos sirve mucho que menciones:\n\n✂️ ¿Qué tal quedó tu corte de cabello / arreglo de barba?\n☕ ¿Cómo sentiste la atención, la puntualidad y el ambiente?\n📍 ¿Nos recomendarías como tu barbería preferida en Santiago Centro?\n\n👉 Deja tu reseña en 30 segundos aquí: https://g.page/r/Cee_fupz7sMXEBM/review"   // texto del pedido de reseña ({nombre}); vacío = sin botón de reseña
};
