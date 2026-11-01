// Configuración de ESTE negocio. Un archivo por despliegue: el código del panel no trae ningún dato de otro negocio.
// Salón Men Saúl Fino (valores actuales). Para un cliente nuevo, este archivo se genera con sus propios datos (ver la guía de instalación).
window.BP_CONFIG = {
  apiUrl: 'https://barberpilot-api-production.up.railway.app',   // servidor de este negocio
  tenantSlug: 'saulfino',                                         // identificador interno del negocio en su propio servidor
  nombre: 'Salon Men Saúl Fino',                                  // nombre completo (encabezado, comprobantes, mensajes)
  nombreCorto: 'Salon Men',                                       // para textos cortos (ticket de 58 mm, mensaje de agradecimiento)
  local: 'Local 222',
  lugar: 'Salon Men Saúl Fino · Local 222',                       // "Te esperamos en ..."
  direccion: 'Local 222 · Galería Santiago Centro',               // pie de los comprobantes
  direccionLarga: 'Galería Santiago Centro · Local 222 · Línea 1 Metro',
  reservaUrl: 'https://salonmensf.livedata.cl',                   // página de reservas (vacío = el mensaje de agradecimiento no lleva enlace)
  locale: 'es-CL',                                                // formato de números y fechas
  timeZone: 'America/Santiago',                                   // zona horaria del negocio
  currency: 'CLP'
};
