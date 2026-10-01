import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Store } from "./store.js";
import { Crm } from "./crm.js";
import { importarHubspot } from "./hubspot.js";
import { EjecutorAgentes } from "./agentes.js";
import { Orquestador, LIMITES } from "./orquestador.js";
import { Equipo } from "./equipo.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const equipo = new Equipo(path.join(raiz, "config/equipo.json"));
const empresa = fs.readFileSync(path.join(raiz, "config/empresa.md"), "utf8");
const store = new Store(path.join(raiz, "data/estado.json"));
const crm = new Crm(path.join(raiz, "data/crm.db"));

const tieneCredenciales = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
if (tieneCredenciales) {
  const ejecutor = new EjecutorAgentes({ equipo, empresa, store, crm });
  new Orquestador({ equipo, store, ejecutor }).iniciar();
} else {
  console.warn("Sin ANTHROPIC_API_KEY: la oficina se abre en modo vista, sin que los agentes trabajen.");
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(raiz, "public")));
app.get("/equipo.json", (_req, res) => res.json(equipo));

const esAgente = (id) => id !== "ceo" && equipo.existe(id);
const nombre = (id) => (id === "ceo" ? equipo.ceo.nombre : equipo.agentes.find((a) => a.id === id)?.nombre ?? id);
const malo = (res, texto) => res.status(400).json({ error: texto });

app.get("/api/estado", (_req, res) => {
  res.json({
    equipo,
    modo: tieneCredenciales ? "activo" : "vista",
    limites: LIMITES,
    estado: store.estado,
  });
});

// El CEO asigna una tarea a cualquier agente.
app.post("/api/tareas", (req, res) => {
  const { asignadoA, titulo, descripcion = "" } = req.body ?? {};
  if (!esAgente(asignadoA)) return malo(res, "Elige a quién asignar la tarea.");
  if (!titulo?.trim()) return malo(res, "Escribe un título para la tarea.");
  res.json(store.crearTarea({ asignadoA, titulo: titulo.trim(), descripcion: descripcion.trim(), creadaPor: "ceo" }));
});

// El CEO escribe a un agente.
app.post("/api/mensajes", (req, res) => {
  const { para, texto } = req.body ?? {};
  if (!esAgente(para)) return malo(res, "Elige un destinatario.");
  if (!texto?.trim()) return malo(res, "El mensaje está vacío.");
  store.registrar("ceo", `escribió a ${nombre(para)}`);
  res.json(store.enviarMensaje({ de: "ceo", para, texto: texto.trim() }));
});

// El CEO marca como leídos los mensajes que le han enviado.
app.post("/api/mensajes/leidos", (_req, res) => {
  store.marcarLeidos(store.bandeja("ceo").map((m) => m.id));
  res.json({ ok: true });
});

app.post("/api/aprobaciones/:id", (req, res) => {
  const { decision, comentario = "" } = req.body ?? {};
  if (!["aprobada", "rechazada"].includes(decision)) return malo(res, "Decisión no válida.");
  const ap = store.resolverAprobacion(req.params.id, decision, comentario.trim());
  if (!ap) return malo(res, "Esa aprobación ya no está pendiente.");
  if (ap.tareaId) store.actualizarTarea(ap.tareaId, { estado: "en_curso" });
  let nota = "";
  if (ap.tipo === "contratacion" && decision === "aprobada") {
    try {
      const nuevo = contratar(ap.propuesta);
      nota = ` Ya forma parte del equipo con el id «${nuevo.id}».`;
    } catch (err) {
      nota = ` No se pudo crear el agente: ${err.message}`;
    }
  }
  store.enviarMensaje({
    de: "ceo",
    para: ap.solicitante,
    texto: `Tu solicitud «${ap.titulo}» ha sido ${decision}.${ap.comentario ? ` Comentario: ${ap.comentario}` : ""}${nota}`,
  });
  store.registrar("ceo", `${decision === "aprobada" ? "aprobó" : "rechazó"} «${ap.titulo}»`);
  res.json(ap);
});

// ---- Equipo: crear, editar y dar de baja agentes y departamentos ----
function contratar(datos) {
  let departamento = datos.departamento;
  if (!equipo.departamentos.some((d) => d.id === departamento)) {
    departamento = equipo.crearDepartamento(departamento).id;
  }
  const agente = equipo.crearAgente({ ...datos, departamento });
  store.estadoAgente(agente.id, "libre");
  store.registrar("ceo", `incorporó a ${agente.nombre} como ${agente.cargo}`);
  store.enviarMensaje({
    de: "ceo",
    para: agente.id,
    texto: "Bienvenido/a al equipo de Green Interlink. Preséntate a tu responsable y pregúntale por qué empezar.",
  });
  return agente;
}

app.post("/api/agentes", (req, res) => {
  try {
    res.json(contratar(req.body ?? {}));
  } catch (err) {
    malo(res, err.message);
  }
});

app.put("/api/agentes/:id", (req, res) => {
  try {
    const agente = equipo.editarAgente(req.params.id, req.body ?? {});
    store.registrar("ceo", `actualizó la ficha de ${agente.nombre}`);
    res.json(agente);
  } catch (err) {
    malo(res, err.message);
  }
});

app.delete("/api/agentes/:id", (req, res) => {
  try {
    const agente = equipo.darDeBaja(req.params.id);
    for (const t of store.estado.tareas) {
      if (t.asignadoA === agente.id && t.estado !== "hecha") {
        store.actualizarTarea(t.id, { asignadoA: agente.reportaA === "ceo" ? t.asignadoA : agente.reportaA });
      }
    }
    store.registrar("ceo", `dio de baja a ${agente.nombre}`);
    res.json(agente);
  } catch (err) {
    malo(res, err.message);
  }
});

app.post("/api/departamentos", (req, res) => {
  try {
    const depto = equipo.crearDepartamento(req.body?.nombre);
    store.registrar("ceo", `creó el departamento ${depto.nombre}`);
    res.json(depto);
  } catch (err) {
    malo(res, err.message);
  }
});

app.post("/api/borradores/:id", (req, res) => {
  const { estado } = req.body ?? {};
  if (!["enviado", "descartado", "borrador"].includes(estado)) return malo(res, "Estado no válido.");
  const b = store.actualizarBorrador(req.params.id, estado);
  if (!b) return malo(res, "No existe ese borrador.");
  if (estado === "enviado") {
    store.enviarMensaje({ de: "ceo", para: b.autor, texto: `He enviado/publicado tu borrador ${b.id} (${b.canal}).` });
  }
  res.json(b);
});

// ---- CRM ----
const crmRuta = (fn) => (req, res) => {
  try {
    const r = fn(req);
    if (r === null) return res.status(404).json({ error: "No encontrado." });
    res.json(r);
  } catch (err) {
    malo(res, err.message);
  }
};
const numero = (v, def) => (Number.isFinite(Number(v)) && v !== "" && v !== undefined ? Number(v) : def);

app.get("/api/crm/resumen", crmRuta(() => ({ resumen: crm.resumen(), negocios: crm.tablero() })));
app.get(
  "/api/crm/empresas",
  crmRuta((req) =>
    crm.buscarEmpresas({
      q: req.query.q ?? "",
      tipo: req.query.tipo ?? "",
      sinActividadDias: numero(req.query.sinActividad, 0),
      limite: Math.min(numero(req.query.limite, 50), 200),
      desplazamiento: numero(req.query.desde, 0),
    }),
  ),
);
app.get("/api/crm/empresas/:id", crmRuta((req) => crm.fichaEmpresa(req.params.id)));
app.post("/api/crm/empresas", crmRuta((req) => crm.guardarEmpresa({ ...req.body, id: undefined })));
app.put("/api/crm/empresas/:id", crmRuta((req) => crm.guardarEmpresa({ ...req.body, id: req.params.id })));
app.get(
  "/api/crm/contactos",
  crmRuta((req) =>
    crm.buscarContactos({
      q: req.query.q ?? "",
      empresaId: req.query.empresa ?? null,
      limite: Math.min(numero(req.query.limite, 50), 200),
      desplazamiento: numero(req.query.desde, 0),
    }),
  ),
);
app.post("/api/crm/contactos", crmRuta((req) => crm.guardarContacto({ ...req.body, id: undefined })));
app.put("/api/crm/contactos/:id", crmRuta((req) => crm.guardarContacto({ ...req.body, id: req.params.id })));
app.get("/api/crm/negocios/:id", crmRuta((req) => crm.fichaNegocio(req.params.id)));
app.post(
  "/api/crm/negocios",
  crmRuta((req) => {
    const n = crm.guardarNegocio({ ...req.body, id: undefined, responsable: req.body?.responsable || "ceo" });
    store.registrar("ceo", `abrió el negocio «${n.titulo}»`);
    return n;
  }),
);
app.put(
  "/api/crm/negocios/:id",
  crmRuta((req) => {
    const antes = crm.negocio(req.params.id);
    const n = crm.guardarNegocio({ ...req.body, id: req.params.id });
    if (antes && antes.etapa !== n.etapa) {
      const verbo = { ganado: "ganó", perdido: "dio por perdido" }[n.etapa];
      store.registrar("ceo", verbo ? `${verbo} el negocio «${n.titulo}»` : `movió «${n.titulo}» a ${n.etapa}`);
      if (verbo && n.responsable && n.responsable !== "ceo" && equipo.existe(n.responsable)) {
        store.enviarMensaje({
          de: "ceo",
          para: n.responsable,
          texto: `El negocio «${n.titulo}» está ${n.etapa}.${n.motivo_cierre ? ` Motivo: ${n.motivo_cierre}` : ""}`,
        });
      }
    }
    return n;
  }),
);
app.post("/api/crm/actividades", crmRuta((req) => crm.registrarActividad({ ...req.body, autor: "ceo" })));

// Importación desde HubSpot en segundo plano, con progreso consultable.
let importacion = { estado: "inactiva" };
app.get("/api/crm/importacion", (_req, res) => res.json({ ...importacion, tokenConfigurado: Boolean(process.env.HUBSPOT_TOKEN) }));
app.post("/api/crm/importacion", (_req, res) => {
  if (!process.env.HUBSPOT_TOKEN) return malo(res, "Añade HUBSPOT_TOKEN al archivo .env y reinicia la oficina.");
  if (importacion.estado === "en_curso") return malo(res, "Ya hay una importación en marcha.");
  importacion = { estado: "en_curso", fase: "Conectando con HubSpot" };
  store.registrar("ceo", "inició la importación desde HubSpot");
  importarHubspot({ crm, token: process.env.HUBSPOT_TOKEN, progreso: (p) => (importacion = { estado: "en_curso", ...p }) })
    .then((c) => {
      importacion = { estado: "terminada", ...c };
      store.registrar("ceo", `importó de HubSpot ${c.empresas} empresas, ${c.contactos} contactos, ${c.negocios} negocios y ${c.notas} notas`);
    })
    .catch((err) => {
      importacion = { estado: "error", error: err.message };
      store.registrar("ceo", `la importación desde HubSpot falló: ${err.message}`);
    });
  res.json(importacion);
});

app.post("/api/pausa", (req, res) => {
  store.estado.pausado = Boolean(req.body?.pausado);
  store.registrar("ceo", store.estado.pausado ? "pausó la oficina" : "reanudó la oficina");
  res.json({ pausado: store.estado.pausado });
});

// Avisos en tiempo real para la interfaz.
app.get("/api/eventos", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const avisar = () => res.write("event: cambio\ndata: {}\n\n");
  store.on("cambio", avisar);
  crm.on("cambio", avisar);
  const latido = setInterval(() => res.write(": ok\n\n"), 25_000);
  req.on("close", () => {
    store.off("cambio", avisar);
    crm.off("cambio", avisar);
    clearInterval(latido);
  });
});

const puerto = Number(process.env.PUERTO || 3000);
app.listen(puerto, () => console.log(`Oficina de Green Interlink en http://localhost:${puerto}`));
