// Configuración de ESTE negocio. Un archivo por despliegue: el código del panel no trae ningún dato de otro negocio.
// Salón Men Saúl Fino (valores actuales, copiados del código anterior). Para un cliente nuevo este archivo se genera con scripts/generar-config-control.js.
window.BP_CONFIG = {
  apiUrl: "https://barberpilot-api-production.up.railway.app",   // servidor de este negocio
  tenantSlug: "saulfino",   // identificador interno del negocio en su propio servidor
  nombre: "Salon Men Saúl Fino",
  nombreCorto: "Salon Men",
  local: "Local 222",
  lugar: "Salon Men Saúl Fino · Local 222",
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
    {
      "id": "b1",
      "nombre": "Didian",
      "active": true
    },
    {
      "id": "b2",
      "nombre": "Emerson",
      "active": true
    },
    {
      "id": "b4",
      "nombre": "David",
      "active": false
    },
    {
      "id": "b5",
      "nombre": "Steven",
      "active": true
    },
    {
      "id": "b6",
      "nombre": "Winder",
      "active": true
    }
  ],   // barberos mostrados mientras el servidor responde (vacío = ninguno)
  nombresCanonicos: {
    "b1": "Didian",
    "b2": "Emerson",
    "b5": "Steven",
    "b6": "Winder"
  },
  mensajeResena: "¡Hola {nombre}! Esperamos que hayas disfrutado tu corte y servicio hoy en la barbería.\nNos ayuda enormemente que nos dejes una breve opinión en Google para seguir mejorando.\nPara que no pierdas tiempo pensando qué poner, aquí tienes un par de ideas sobre lo que nos sirve mucho que menciones:\n\n✂️ ¿Qué tal quedó tu corte de cabello / arreglo de barba?\n☕ ¿Cómo sentiste la atención, la puntualidad y el ambiente?\n📍 ¿Nos recomendarías como tu barbería preferida en Santiago Centro?\n\n👉 Deja tu reseña en 30 segundos aquí: https://g.page/r/Cee_fupz7sMXEBM/review"   // texto del pedido de reseña ({nombre}); vacío = sin botón de reseña
};
