// Importa de HubSpot (también el plan gratuito) empresas, contactos, negocios y notas.
// Usa el token de una "aplicación privada" de HubSpot con permisos de solo lectura.
// Se puede repetir: lo ya importado se actualiza por su id de HubSpot, sin duplicados.
import { normalizar } from "./crm.js";

const API = "https://api.hubapi.com";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(token, ruta, intentos = 5) {
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429 || r.status >= 500) {
      await espera(1500 * (i + 1));
      continue;
    }
    if (r.status === 401) throw new Error("HubSpot rechaza el token. Revisa HUBSPOT_TOKEN en el archivo .env.");
    if (r.status === 403) {
      const err = new Error(`El token no tiene permiso para ${ruta.split("?")[0]}.`);
      err.sinPermiso = true;
      throw err;
    }
    if (!r.ok) throw new Error(`HubSpot respondió ${r.status} en ${ruta.split("?")[0]}.`);
    return r.json();
  }
  throw new Error("HubSpot no responde. Inténtalo de nuevo en unos minutos.");
}

// Recorre todas las páginas de un tipo de objeto.
async function* objetos(token, tipo, propiedades, asociaciones = []) {
  let after = "";
  do {
    const params = new URLSearchParams({ limit: "100", properties: propiedades.join(",") });
    if (asociaciones.length) params.set("associations", asociaciones.join(","));
    if (after) params.set("after", after);
    const pagina = await pedir(token, `/crm/v3/objects/${tipo}?${params}`);
    for (const o of pagina.results ?? []) yield o;
    after = pagina.paging?.next?.after ?? "";
    await espera(120); // el plan gratuito admite unas 100 peticiones cada 10 segundos
  } while (after);
}

const asociados = (o, tipo) => (o.associations?.[tipo]?.results ?? []).map((x) => String(x.id));

const TIPO_POR_CICLO = {
  customer: "cliente",
  evangelist: "cliente",
  lead: "prospecto",
  subscriber: "prospecto",
  marketingqualifiedlead: "prospecto",
  salesqualifiedlead: "prospecto",
  opportunity: "prospecto",
};

// Traduce las etapas del pipeline de HubSpot a las nuestras usando la probabilidad de cada etapa.
async function mapaEtapas(token) {
  const mapa = {};
  const pipelines = await pedir(token, "/crm/v3/pipelines/deals");
  for (const p of pipelines.results ?? []) {
    for (const e of p.stages ?? []) {
      const prob = Number(e.metadata?.probability ?? 0);
      const cerrada = String(e.metadata?.isClosed) === "true";
      let etapa;
      if (cerrada) etapa = prob >= 1 ? "ganado" : "perdido";
      else if (prob < 0.2) etapa = "contactado";
      else if (prob <= 0.4) etapa = "reunion";
      else if (prob <= 0.6) etapa = "propuesta";
      else etapa = "negociacion";
      mapa[e.id] = { etapa, nombre: e.label };
    }
  }
  return mapa;
}

function textoNota(html) {
  return String(html ?? "")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function importarHubspot({ crm, token, progreso = () => {} }) {
  if (!token) throw new Error("Falta HUBSPOT_TOKEN en el archivo .env.");
  crm.silencioso = true;
  try {
    return await importar(crm, token, progreso);
  } finally {
    crm.silencioso = false;
    crm.cambio();
  }
}

async function importar(crm, token, progreso) {
  const cuenta = { empresas: 0, contactos: 0, negocios: 0, notas: 0, avisos: [] };
  const avisar = (texto) => {
    cuenta.avisos.push(texto);
    progreso({ ...cuenta, fase: texto });
  };

  // 1. Empresas
  progreso({ ...cuenta, fase: "Importando empresas" });
  for await (const o of objetos(token, "companies", ["name", "domain", "industry", "city", "country", "phone", "website", "lifecyclestage", "description"])) {
    const p = o.properties ?? {};
    crm.guardarEmpresa({
      id: crm.idPorHubspot("empresas", o.id) ?? undefined,
      hubspot_id: String(o.id),
      nombre: p.name || p.domain || `Empresa ${o.id}`,
      dominio: p.domain,
      sector: p.industry,
      ciudad: p.city,
      pais: p.country,
      telefono: p.phone,
      web: p.website,
      notas: p.description,
      tipo: TIPO_POR_CICLO[p.lifecyclestage] ?? "prospecto",
    });
    if (++cuenta.empresas % 100 === 0) progreso({ ...cuenta, fase: "Importando empresas" });
  }

  // 2. Contactos (con su empresa y su estado de baja de emails)
  progreso({ ...cuenta, fase: "Importando contactos" });
  const empresasPorNombre = new Map(crm.todos("SELECT id, nombre FROM empresas").map((e) => [normalizar(e.nombre), e.id]));
  for await (const o of objetos(token, "contacts", ["firstname", "lastname", "email", "phone", "mobilephone", "jobtitle", "company", "hs_email_optout", "lifecyclestage"], ["companies"])) {
    const p = o.properties ?? {};
    const hsEmpresa = asociados(o, "companies")[0];
    const empresaId = crm.idPorHubspot("empresas", hsEmpresa) ?? (p.company ? empresasPorNombre.get(normalizar(p.company)) : null) ?? null;
    crm.guardarContacto({
      id: crm.idPorHubspot("contactos", o.id) ?? undefined,
      hubspot_id: String(o.id),
      empresa_id: empresaId,
      nombre: p.firstname || p.email || `Contacto ${o.id}`,
      apellidos: p.lastname,
      email: p.email,
      telefono: p.phone || p.mobilephone,
      cargo: p.jobtitle,
      consentimiento: String(p.hs_email_optout) === "true" ? "baja" : "desconocido",
    });
    if (++cuenta.contactos % 100 === 0) progreso({ ...cuenta, fase: "Importando contactos" });
  }

  // 3. Negocios
  progreso({ ...cuenta, fase: "Importando negocios" });
  try {
    const etapas = await mapaEtapas(token);
    for await (const o of objetos(token, "deals", ["dealname", "amount", "dealstage", "closedate", "createdate"], ["companies", "contacts"])) {
      const p = o.properties ?? {};
      const etapa = etapas[p.dealstage] ?? { etapa: "contactado", nombre: p.dealstage };
      const cerrado = ["ganado", "perdido"].includes(etapa.etapa);
      crm.guardarNegocio({
        id: crm.idPorHubspot("negocios", o.id) ?? undefined,
        hubspot_id: String(o.id),
        hubspot_etapa: etapa.nombre,
        titulo: p.dealname || `Negocio ${o.id}`,
        empresa_id: crm.idPorHubspot("empresas", asociados(o, "companies")[0]),
        contacto_id: crm.idPorHubspot("contactos", asociados(o, "contacts")[0]),
        etapa: etapa.etapa,
        valor: p.amount ? Number(p.amount) : null,
        cierre_previsto: cerrado ? null : p.closedate?.slice(0, 10),
        cerrado: cerrado ? p.closedate || p.createdate : null,
      });
      if (++cuenta.negocios % 100 === 0) progreso({ ...cuenta, fase: "Importando negocios" });
    }
  } catch (err) {
    if (!err.sinPermiso) throw err;
    avisar("Negocios no importados: el token no tiene el permiso crm.objects.deals.read.");
  }

  // 4. Notas: el historial de cada cliente
  progreso({ ...cuenta, fase: "Importando notas" });
  try {
    for await (const o of objetos(token, "notes", ["hs_note_body", "hs_timestamp"], ["companies", "contacts", "deals"])) {
      const p = o.properties ?? {};
      const texto = textoNota(p.hs_note_body);
      if (!texto) continue;
      const empresaId = crm.idPorHubspot("empresas", asociados(o, "companies")[0]);
      const contactoId = crm.idPorHubspot("contactos", asociados(o, "contacts")[0]);
      const negocioId = crm.idPorHubspot("negocios", asociados(o, "deals")[0]);
      if (!empresaId && !contactoId && !negocioId) continue;
      crm.registrarActividad(
        { tipo: "nota", texto, empresa_id: empresaId, contacto_id: contactoId, negocio_id: negocioId, autor: "hubspot", fecha: p.hs_timestamp, hubspot_id: String(o.id) },
        false,
      );
      cuenta.notas++;
    }
  } catch (err) {
    if (!err.sinPermiso) throw err;
    avisar("Notas no importadas: el token no tiene permiso para leerlas.");
  }

  progreso({ ...cuenta, fase: "Importación terminada", terminado: true });
  return cuenta;
}
