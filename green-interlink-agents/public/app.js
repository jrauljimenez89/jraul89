// Oficina virtual de Green Interlink: planta, tableros y bandeja del CEO.
// Funciona contra el servidor (/api) o, si no lo encuentra, con los datos de ejemplo de demo.js.

const ETAPAS = [
  ["prospecto", "Prospecto"],
  ["contactado", "Contactado"],
  ["reunion", "Reunión"],
  ["propuesta", "Propuesta"],
  ["negociacion", "Negociación"],
  ["ganada", "Ganada"],
  ["perdida", "Perdida"],
];
const ESTADOS_TAREA = [
  ["pendiente", "Pendiente"],
  ["en_curso", "En curso"],
  ["esperando_aprobacion", "Esperando tu aprobación"],
  ["bloqueada", "Bloqueada"],
  ["hecha", "Hecha"],
];
const CANALES = {
  linkedin_mensaje: "Mensaje de LinkedIn",
  linkedin_publicacion: "Publicación de LinkedIn",
  instagram: "Instagram",
  email: "Email",
  blog: "Artículo de blog",
  otro: "Otro",
};
const FONDOS_SALA = ["#cfe3da", "#f1dccb", "#dcd8ee", "#d6e4f0", "#efe3c4", "#e9d3d9", "#d5e8cf", "#e4e0d4", "#d9e7e7", "#ecd9c6"];
const CAMISAS = ["#2f5d50", "#7b4a2a", "#3d4f73", "#5b5b66", "#8a3f3a", "#41664a", "#6a5a86", "#2e4a5c"];
const PIELES = ["#F1C9A5", "#E8B994", "#D9A27A", "#C98E62", "#B97A55", "#8D5A3B", "#6B4128"];
const PELOS = { corto: "Corto", media: "Media melena", larga: "Largo", mono: "Recogido", rizado: "Rizado", rapado: "Rapado" };
const COLORES_PELO = ["#15100D", "#2A1A12", "#4A2C1C", "#6B4A2E", "#8A4B22", "#B7884B", "#5A5A5A", "#BDB6AA"];

let datos = { modo: "cargando", equipo: { ceo: {}, departamentos: [], agentes: [] }, estado: null, limites: {} };
let pestana = (location.hash || "#oficina").slice(1);

// ---------- Utilidades ----------
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const euros = (n) =>
  typeof n === "number" ? n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—";

function hace(fecha) {
  const s = Math.max(0, (Date.now() - Date.parse(fecha)) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function hash(texto) {
  let h = 2166136261;
  for (const c of String(texto)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Math.abs(h);
}

const agentes = () => datos.equipo.agentes;
const agente = (id) => agentes().find((a) => a.id === id);
const esCeo = (id) => id === "ceo";
const nombreDe = (id) => (esCeo(id) ? datos.equipo.ceo.nombre : agente(id)?.nombre ?? id);
const nombreCorto = (id) => (esCeo(id) ? "Tú" : (agente(id)?.nombre ?? id).split(" ")[0]);

// ---------- Caras ----------
function aspectoPorDefecto(semilla) {
  const h = hash(semilla);
  return {
    piel: PIELES[h % PIELES.length],
    pelo: Object.keys(PELOS)[(h >> 3) % 6],
    colorPelo: COLORES_PELO[(h >> 6) % 6],
    gafas: (h >> 9) % 4 === 0,
    barba: false,
  };
}

function caraSvg(persona) {
  if (persona?.foto) return `<img src="${esc(persona.foto)}" alt="">`;
  const id = persona?.id ?? "x";
  const a = { ...aspectoPorDefecto(id), ...(persona?.avatar ?? {}) };
  const deptos = datos.equipo.departamentos;
  const iDepto = Math.max(0, deptos.findIndex((d) => d.id === persona?.departamento));
  const fondo = esCeo(id) ? "#c7dcd3" : FONDOS_SALA[iDepto % FONDOS_SALA.length];
  const camisa = esCeo(id) ? "#1f3b33" : CAMISAS[hash(id + "c") % CAMISAS.length];
  const pelo = a.colorPelo;

  const detras = {
    larga: `<path d="M18 30 Q18 12 32 12 Q46 12 46 30 L47 50 Q32 54 17 50 Z" fill="${pelo}"/>`,
    media: `<path d="M18 30 Q18 12 32 12 Q46 12 46 30 L46 42 Q32 45 18 42 Z" fill="${pelo}"/>`,
    mono: `<circle cx="32" cy="11" r="6" fill="${pelo}"/>`,
  }[a.pelo] ?? "";
  const delante = {
    larga: `<path d="M19 28 Q19 14 32 14 Q45 14 45 28 Q41 20 32 20 Q23 20 19 28 Z" fill="${pelo}"/>`,
    media: `<path d="M19 28 Q19 14 32 14 Q45 14 45 28 Q40 19 30 21 Q24 22 19 28 Z" fill="${pelo}"/>`,
    mono: `<path d="M19 27 Q19 15 32 15 Q45 15 45 27 Q41 20 32 20 Q23 20 19 27 Z" fill="${pelo}"/>`,
    corto: `<path d="M19 26 Q19 13 32 13 Q45 13 45 26 Q44 19 38 19 Q30 21 20 24 Z" fill="${pelo}"/>`,
    rizado: [[21, 23], [24, 17], [30, 14], [36, 14], [41, 18], [44, 24], [19, 28]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${pelo}"/>`)
      .join(""),
    rapado: `<path d="M20 25 Q20 15 32 15 Q44 15 44 25 Q38 19 32 19 Q26 19 20 25 Z" fill="${pelo}" opacity="0.75"/>`,
  }[a.pelo] ?? "";
  const barba = a.barba
    ? `<path d="M20 31 Q21 45 32 46 Q43 45 44 31 Q42 39 36 39.5 Q32 38 28 39.5 Q22 39 20 31 Z" fill="${pelo}" opacity="0.92"/>`
    : "";
  const gafas = a.gafas
    ? `<g fill="none" stroke="#2a2a2a" stroke-width="1.1"><circle cx="27" cy="30" r="3.7"/><circle cx="37" cy="30" r="3.7"/><path d="M30.7 30 H33.3"/></g>`
    : "";

  return `<svg viewBox="0 0 64 64" role="img" aria-label="${esc(persona?.nombre ?? "")}">
    <circle cx="32" cy="32" r="32" fill="${fondo}"/>
    ${detras}
    <path d="M9 64 C11 50 21 46 32 46 C43 46 53 50 55 64 Z" fill="${camisa}"/>
    <rect x="27.5" y="38" width="9" height="10" rx="3" fill="${a.piel}"/>
    <path d="M27.5 46 L32 50 L36.5 46" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.2"/>
    <circle cx="20.5" cy="31" r="2.6" fill="${a.piel}"/><circle cx="43.5" cy="31" r="2.6" fill="${a.piel}"/>
    <ellipse cx="32" cy="29" rx="12" ry="14" fill="${a.piel}"/>
    ${delante}
    <path d="M24.5 26.4 Q27 25.2 29.4 26.1 M34.6 26.1 Q37 25.2 39.5 26.4" stroke="${pelo}" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="27" cy="30" r="1.6" fill="#1d1d1d"/><circle cx="37" cy="30" r="1.6" fill="#1d1d1d"/>
    <path d="M32 31 Q30.6 34 32.6 34.6" stroke="#000" stroke-opacity="0.25" stroke-width="1" fill="none"/>
    ${barba}
    <path d="M28.2 37 Q32 40 35.8 37" stroke="#7a3b2e" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    ${gafas}
  </svg>`;
}

const cara = (id) => caraSvg(esCeo(id) ? { ...datos.equipo.ceo, id: "ceo", avatar: datos.equipo.ceo.avatar ?? { pelo: "corto", piel: "#E3B08A", colorPelo: "#2A1A12" } } : agente(id) ?? { id });
const personaMini = (id) => `<span class="persona-mini">${cara(id)}${esc(nombreCorto(id))}</span>`;

// ---------- API (servidor real o demo local) ----------
async function api(metodo, ruta, cuerpo) {
  if (datos.modo === "demo") {
    demoApi(metodo, ruta, cuerpo ?? {});
    render();
    return;
  }
  const r = await fetch(ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || "No se pudo completar la acción.");
  await cargar();
  return json;
}

async function cargar() {
  try {
    const r = await fetch("/api/estado", { cache: "no-store" });
    if (!r.ok) throw new Error();
    const json = await r.json();
    datos = { ...json };
  } catch {
    if (datos.modo !== "demo") arrancarDemo();
  }
  render();
}

function arrancarDemo() {
  const demo = window.DEMO;
  if (!demo) {
    datos.modo = "sin-servidor";
    return;
  }
  datos = { modo: "demo", equipo: structuredClone(demo.equipo), estado: structuredClone(demo.estado), limites: { MAX_TURNOS_DIA: 150 } };
  // Las fechas de ejemplo se expresan en minutos hacia atrás para que siempre parezcan recientes.
  const ajustar = (lista, campos) =>
    lista.forEach((x) => campos.forEach((c) => typeof x[c] === "number" && (x[c] = new Date(Date.now() - x[c] * 60000).toISOString())));
  const e = datos.estado;
  ajustar(e.tareas, ["creada", "actualizada"]);
  ajustar(e.mensajes, ["fecha"]);
  ajustar(e.aprobaciones, ["fecha"]);
  ajustar(e.borradores, ["fecha"]);
  ajustar(e.oportunidades, ["creada", "actualizada"]);
  ajustar(e.actividad, ["fecha"]);
  for (const id in e.agentes) ajustar([e.agentes[id]], ["desde"]);
  e.consumo.fecha = new Date().toISOString().slice(0, 10);
}

function demoApi(metodo, ruta, c) {
  const e = datos.estado;
  const ahora = new Date().toISOString();
  const id = (p) => `${p}-${e.siguienteId++}`;
  const log = (texto) => e.actividad.unshift({ fecha: ahora, agente: "ceo", texto });
  const [, , recurso, rid, extra] = ruta.split("/");

  if (recurso === "tareas") {
    if (!c.asignadoA || !c.titulo?.trim()) throw new Error("Indica a quién y un título.");
    e.tareas.unshift({ id: id("T"), titulo: c.titulo, descripcion: c.descripcion ?? "", asignadoA: c.asignadoA, creadaPor: "ceo", estado: "pendiente", resultado: "", creada: ahora, actualizada: ahora });
    log(`asignó «${c.titulo}» a ${nombreDe(c.asignadoA)}`);
  } else if (recurso === "mensajes" && rid === "leidos") {
    e.mensajes.forEach((m) => m.para === "ceo" && (m.leido = true));
  } else if (recurso === "mensajes") {
    if (!c.texto?.trim()) throw new Error("El mensaje está vacío.");
    e.mensajes.unshift({ id: id("M"), de: "ceo", para: c.para, texto: c.texto, fecha: ahora, leido: false });
    log(`escribió a ${nombreDe(c.para)}`);
  } else if (recurso === "aprobaciones") {
    const ap = e.aprobaciones.find((a) => a.id === rid);
    Object.assign(ap, { estado: c.decision, comentario: c.comentario ?? "" });
    if (ap.tareaId) {
      const t = e.tareas.find((x) => x.id === ap.tareaId);
      if (t) t.estado = "en_curso";
    }
    log(`${c.decision === "aprobada" ? "aprobó" : "rechazó"} «${ap.titulo}»`);
  } else if (recurso === "borradores") {
    e.borradores.find((b) => b.id === rid).estado = c.estado;
  } else if (recurso === "oportunidades") {
    e.oportunidades.find((o) => o.id === rid).etapa = c.etapa;
  } else if (recurso === "pausa") {
    e.pausado = c.pausado;
  } else if (recurso === "departamentos") {
    datos.equipo.departamentos.push({ id: `d${e.siguienteId++}`, nombre: c.nombre, sala: `S-${String(datos.equipo.departamentos.length + 1).padStart(2, "0")}` });
  } else if (recurso === "agentes" && metodo === "DELETE") {
    datos.equipo.agentes = agentes().filter((a) => a.id !== rid);
    log(`dio de baja a ${rid}`);
  } else if (recurso === "agentes") {
    if (!c.nombre?.trim() || !c.cargo?.trim()) throw new Error("Escribe nombre y cargo.");
    let depto = c.departamento;
    if (!datos.equipo.departamentos.some((d) => d.id === depto)) {
      const nuevo = { id: `d${e.siguienteId++}`, nombre: depto, sala: `S-${String(datos.equipo.departamentos.length + 1).padStart(2, "0")}` };
      datos.equipo.departamentos.push(nuevo);
      depto = nuevo.id;
    }
    const resp = String(c.responsabilidades ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    if (metodo === "PUT") {
      Object.assign(agente(rid), { ...c, departamento: depto, responsabilidades: resp });
    } else {
      const nid = c.nombre.split(" ")[0].toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") + e.siguienteId++;
      datos.equipo.agentes.push({ ...c, id: nid, departamento: depto, responsabilidades: resp, extension: String(900 + agentes().length) });
      e.agentes[nid] = { estado: "libre" };
      log(`incorporó a ${c.nombre} como ${c.cargo}`);
    }
  }
  void extra;
}

// ---------- Cabecera ----------
function renderCabecera() {
  const e = datos.estado;
  const modo = datos.modo === "activo" && e?.pausado ? "pausado" : datos.modo;
  const textos = { activo: "Equipo trabajando", pausado: "Oficina en pausa", vista: "Modo vista", demo: "Demostración", "sin-servidor": "Sin conexión", cargando: "Cargando" };
  $("#estado-modo").className = `pastilla ${modo}`;
  $("#estado-modo").textContent = textos[modo] ?? modo;
  const turnos = e?.consumo?.fecha === new Date().toISOString().slice(0, 10) ? e.consumo.turnos : 0;
  $("#turnos").textContent = `${turnos}/${datos.limites?.MAX_TURNOS_DIA ?? "—"} turnos hoy`;
  $("#boton-pausa").textContent = e?.pausado ? "Reanudar" : "Pausar";
  $("#boton-pausa").hidden = !["activo", "demo"].includes(datos.modo);

  const pendientes = e ? e.aprobaciones.filter((a) => a.estado === "pendiente").length + e.borradores.filter((b) => b.estado === "borrador").length + e.mensajes.filter((m) => m.para === "ceo" && !m.leido).length : 0;
  $("#contador-bandeja").textContent = pendientes;
  $("#contador-bandeja").hidden = pendientes === 0;

  for (const b of document.querySelectorAll(".pestanas button")) {
    b.setAttribute("aria-selected", String(b.dataset.pestana === pestana));
  }

  const aviso = $("#aviso-modo");
  aviso.hidden = !["vista", "demo", "sin-servidor"].includes(datos.modo);
  aviso.innerHTML = {
    vista: "Los agentes no trabajarán hasta que configures tu clave de la API de Claude en el archivo <code>.env</code> y reinicies la oficina.",
    demo: "Esto es una demostración con datos de ejemplo: las empresas, mensajes y cifras son inventados. En tu ordenador, la oficina funciona con tus datos reales.",
    "sin-servidor": "No se encuentra el servidor de la oficina. Arráncalo con <code>npm start</code>.",
  }[datos.modo] ?? "";
}

// ---------- Oficina ----------
function renderPuesto(a) {
  const est = datos.estado.agentes?.[a.id] ?? {};
  const trabajando = est.estado === "trabajando";
  const abiertas = datos.estado.tareas.filter((t) => t.asignadoA === a.id && t.estado !== "hecha").length;
  return `<button class="puesto" data-agente="${esc(a.id)}">
    <span class="cara">${caraSvg(a)}<span class="punto ${trabajando ? "trabajando" : ""}" title="${trabajando ? "Trabajando" : "Disponible"}"></span></span>
    <span>
      <span class="puesto-nombre">${esc(a.nombre)}</span><br>
      <span class="puesto-cargo">${esc(a.cargo)}</span>
      <span class="puesto-meta"><span class="dato tenue">ext. ${esc(a.extension)}</span><span class="dato tenue">${abiertas} tarea${abiertas === 1 ? "" : "s"}</span></span>
    </span>
    ${trabajando && est.foco ? `<span class="puesto-foco">Trabajando en: ${esc(est.foco)}</span>` : ""}
  </button>`;
}

function renderOficina() {
  const e = datos.estado;
  const ceo = datos.equipo.ceo;
  const salas = datos.equipo.departamentos
    .map((d) => {
      const miembros = agentes().filter((a) => a.departamento === d.id);
      return `<section class="sala">
        <div class="sala-cabecera"><h2>${esc(d.nombre)}</h2><span class="dato tenue">${esc(d.sala)}</span></div>
        <div class="puestos">${miembros.map(renderPuesto).join("") || `<p class="sala-vacia">Sala libre. Incorpora un agente a este departamento.</p>`}</div>
      </section>`;
    })
    .join("");

  const feed = e.actividad.slice(0, 40).map(renderLineaActividad).join("");

  return `<div class="planta-contenedor">
    <div class="planta">
      <section class="sala despacho">
        <div class="sala-cabecera"><h2>Despacho del CEO</h2></div>
        <span class="persona-mini" style="gap:10px">${cara("ceo")}<span><strong>${esc(ceo.nombre)}</strong><br><span class="dato tenue">${esc(ceo.cargo)} · ext. ${esc(ceo.extension)}</span></span></span>
        <span class="dato tenue">${agentes().length} agentes · ${datos.equipo.departamentos.length} departamentos</span>
      </section>
      ${salas}
    </div>
    <aside class="centralita">
      <h2>Centralita</h2>
      <ul class="feed">${feed || `<li><span></span><p class="tenue">Aún no hay actividad. Asigna la primera tarea.</p></li>`}</ul>
    </aside>
  </div>`;
}

function renderLineaActividad(x) {
  return `<li><span class="cara">${cara(x.agente)}</span><p><strong>${esc(nombreCorto(x.agente))}</strong> ${esc(x.texto)} <span class="dato tenue">${hace(x.fecha)}</span></p></li>`;
}

// ---------- Tareas ----------
function renderTarjetaTarea(t) {
  return `<article class="tarjeta ${esc(t.estado)}">
    <h4>${esc(t.titulo)}</h4>
    ${t.descripcion ? `<p class="tenue">${esc(t.descripcion.slice(0, 180))}${t.descripcion.length > 180 ? "…" : ""}</p>` : ""}
    ${t.resultado ? `<p class="resultado">${esc(t.resultado)}</p>` : ""}
    <div class="pie">${personaMini(t.asignadoA)}<span class="dato tenue">${esc(t.id)} · de ${esc(nombreCorto(t.creadaPor))}</span></div>
  </article>`;
}

function renderTareas() {
  const cols = ESTADOS_TAREA.map(([id, titulo]) => {
    const lista = datos.estado.tareas.filter((t) => t.estado === id);
    return `<section class="columna">
      <div class="columna-cabecera"><h3>${titulo}</h3><span class="dato tenue">${lista.length}</span></div>
      <div class="tarjetas">${lista.map(renderTarjetaTarea).join("")}</div>
    </section>`;
  }).join("");
  return `<div class="acciones" style="margin:0 0 14px"><button class="boton principal" data-accion="nueva-tarea">Asignar tarea</button></div><div class="tablero">${cols}</div>`;
}

// ---------- Pipeline ----------
function renderPipeline() {
  const ops = datos.estado.oportunidades;
  const abiertas = ops.filter((o) => !["ganada", "perdida"].includes(o.etapa));
  const total = abiertas.reduce((s, o) => s + (o.valorEstimado ?? 0), 0);
  const cols = ETAPAS.map(([id, titulo]) => {
    const lista = ops.filter((o) => o.etapa === id);
    const suma = lista.reduce((s, o) => s + (o.valorEstimado ?? 0), 0);
    return `<section class="columna">
      <div class="columna-cabecera"><h3>${titulo}</h3><span class="dato tenue">${lista.length} · ${euros(suma)}</span></div>
      <div class="tarjetas">${lista
        .map(
          (o) => `<article class="tarjeta">
            <h4>${esc(o.empresa)}</h4>
            <p class="dato">${euros(o.valorEstimado)} / año</p>
            ${o.contacto ? `<p>${esc(o.contacto)}</p>` : ""}
            ${o.necesidad ? `<p class="tenue">${esc(o.necesidad)}</p>` : ""}
            ${o.notas ? `<p class="resultado">${esc(o.notas)}</p>` : ""}
            <div class="pie">${personaMini(o.responsable)}
              <select class="cambiar-etapa" data-op="${esc(o.id)}" aria-label="Mover ${esc(o.empresa)} de etapa" style="width:auto">
                ${ETAPAS.map(([v, l]) => `<option value="${v}" ${v === o.etapa ? "selected" : ""}>${l}</option>`).join("")}
              </select>
            </div>
          </article>`,
        )
        .join("")}</div>
    </section>`;
  }).join("");
  return `<p class="tenue" style="margin:0 0 14px">${abiertas.length} oportunidades abiertas · <strong class="dato" style="font-size:14px">${euros(total)}</strong> de valor anual estimado</p><div class="tablero">${cols}</div>`;
}

// ---------- Bandeja del CEO ----------
function renderBandeja() {
  const e = datos.estado;
  const aps = e.aprobaciones.filter((a) => a.estado === "pendiente");
  const bors = e.borradores.filter((b) => b.estado === "borrador");
  const msgs = e.mensajes.filter((m) => m.para === "ceo").slice(0, 30);
  const sinLeer = msgs.filter((m) => !m.leido).length;

  const aprobaciones = aps
    .map(
      (a) => `<article class="tarjeta">
        <div class="pie" style="margin:0 0 6px">${personaMini(a.solicitante)}<span class="chip ${a.tipo === "contratacion" ? "cobre" : ""}">${a.tipo === "contratacion" ? "Nuevo agente" : "Aprobación"}</span></div>
        <h4>${esc(a.titulo)}</h4>
        <p class="resultado completo">${esc(a.detalle)}</p>
        <div class="acciones">
          <input id="comentario-${esc(a.id)}" placeholder="Comentario (opcional)" aria-label="Comentario">
          <button class="boton principal mini" data-aprobar="${esc(a.id)}" data-decision="aprobada">Aprobar</button>
          <button class="boton mini" data-aprobar="${esc(a.id)}" data-decision="rechazada">Rechazar</button>
        </div>
      </article>`,
    )
    .join("");

  const borradores = bors
    .map(
      (b) => `<article class="tarjeta">
        <div class="pie" style="margin:0 0 6px">${personaMini(b.autor)}<span class="chip">${esc(CANALES[b.canal] ?? b.canal)}</span></div>
        ${b.destinatario ? `<h4>Para: ${esc(b.destinatario)}</h4>` : ""}
        ${b.asunto ? `<p><strong>${esc(b.asunto)}</strong></p>` : ""}
        <p class="resultado completo" id="texto-${esc(b.id)}">${esc(b.contenido)}</p>
        <div class="acciones">
          <button class="boton mini" data-copiar="${esc(b.id)}">Copiar texto</button>
          <button class="boton principal mini" data-borrador="${esc(b.id)}" data-estado="enviado">Marcar como enviado</button>
          <button class="boton mini" data-borrador="${esc(b.id)}" data-estado="descartado">Descartar</button>
        </div>
      </article>`,
    )
    .join("");

  const mensajes = msgs
    .map(
      (m) => `<article class="tarjeta" ${m.leido ? "" : 'style="border-color:var(--cobre)"'}>
        <div class="pie" style="margin:0 0 6px">${personaMini(m.de)}<span class="dato tenue">${hace(m.fecha)}</span></div>
        <p style="white-space:pre-wrap">${esc(m.texto)}</p>
        <div class="acciones"><button class="boton mini" data-responder="${esc(m.de)}">Responder</button></div>
      </article>`,
    )
    .join("");

  return `<div class="bandeja">
    <section class="bloque"><h2>Pendiente de tu aprobación</h2><div class="lista">${aprobaciones || `<p class="vacio">Nada que aprobar ahora mismo.</p>`}</div></section>
    <section class="bloque"><h2>Borradores para enviar desde tus cuentas</h2><div class="lista">${borradores || `<p class="vacio">No hay borradores pendientes.</p>`}</div></section>
    <section class="bloque"><h2>Mensajes para ti</h2>
      ${sinLeer ? `<div class="acciones" style="margin:0 0 10px"><button class="boton mini" data-accion="marcar-leidos">Marcar ${sinLeer} como leídos</button></div>` : ""}
      <div class="lista">${mensajes || `<p class="vacio">Tu equipo aún no te ha escrito.</p>`}</div></section>
  </div>`;
}

// ---------- Actividad ----------
function renderActividad() {
  const e = datos.estado;
  const internos = e.mensajes.filter((m) => m.para !== "ceo" && m.de !== "ceo").slice(0, 60);
  return `<div class="bandeja">
    <section class="bloque"><h2>Conversaciones internas</h2><div class="lista">${
      internos
        .map(
          (m) => `<article class="tarjeta"><div class="pie" style="margin:0 0 6px"><span>${personaMini(m.de)} <span class="tenue">→</span> ${personaMini(m.para)}</span><span class="dato tenue">${hace(m.fecha)}</span></div><p style="white-space:pre-wrap">${esc(m.texto)}</p></article>`,
        )
        .join("") || `<p class="vacio">Aún no hay conversaciones entre agentes.</p>`
    }</div></section>
    <section class="bloque"><h2>Registro de actividad</h2><ul class="feed">${e.actividad.slice(0, 150).map(renderLineaActividad).join("")}</ul></section>
  </div>`;
}

function render() {
  renderCabecera();
  const main = $("#contenido");
  if (!datos.estado) {
    main.innerHTML = "";
    return;
  }
  const vistas = { oficina: renderOficina, tareas: renderTareas, pipeline: renderPipeline, bandeja: renderBandeja, actividad: renderActividad };
  // Conserva lo que el CEO esté escribiendo mientras llegan cambios en tiempo real.
  const enfocado = document.activeElement;
  if (enfocado && main.contains(enfocado) && ["INPUT", "TEXTAREA", "SELECT"].includes(enfocado.tagName)) return;
  main.innerHTML = (vistas[pestana] ?? renderOficina)();
}

// ---------- Diálogos ----------
function abrirAgente(id) {
  const a = agente(id);
  if (!a) return;
  const e = datos.estado;
  const jefe = nombreDe(a.reportaA);
  const equipoDirecto = agentes().filter((x) => x.reportaA === a.id);
  const tareas = e.tareas.filter((t) => t.asignadoA === a.id && t.estado !== "hecha");
  const hilo = e.mensajes.filter((m) => m.de === a.id || m.para === a.id).slice(0, 12);
  const depto = datos.equipo.departamentos.find((d) => d.id === a.departamento);

  const d = $("#dialogo-agente");
  d.innerHTML = `<div class="dialogo-cuerpo">
    <div class="dialogo-cabecera">
      <span class="cara">${caraSvg(a)}</span>
      <div><h2>${esc(a.nombre)}</h2><div class="tenue">${esc(a.cargo)} · ${esc(depto?.nombre ?? "")}</div><div class="dato tenue">ext. ${esc(a.extension)} · reporta a ${esc(jefe)}${equipoDirecto.length ? ` · equipo: ${equipoDirecto.map((x) => esc(x.nombre.split(" ")[0])).join(", ")}` : ""}</div></div>
      <button class="boton mini cerrar" data-cerrar>Cerrar</button>
    </div>
    <div class="ficha"><div class="seccion-titulo">Responsabilidades</div><ul>${(a.responsabilidades ?? []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
      <p class="tenue" style="margin:8px 0 0">${esc(a.personalidad ?? "")}</p></div>
    <div><div class="seccion-titulo">Tareas abiertas (${tareas.length})</div><div class="lista">${tareas.map(renderTarjetaTarea).join("") || `<p class="vacio">Sin tareas abiertas.</p>`}</div></div>
    <div><div class="seccion-titulo">Últimas conversaciones</div><div class="hilo">${
      hilo.map((m) => `<div class="burbuja"><span class="dato tenue">${esc(nombreCorto(m.de))} → ${esc(nombreCorto(m.para))} · ${hace(m.fecha)}</span>\n${esc(m.texto)}</div>`).join("") || `<p class="vacio">Todavía no ha hablado con nadie.</p>`
    }</div></div>
    <form id="form-tarea-agente" class="campos">
      <div class="seccion-titulo">Asignar una tarea a ${esc(a.nombre.split(" ")[0])}</div>
      <label>Título<input id="ta-titulo" required placeholder="Ej.: Lista de 20 instaladores de telecomunicaciones en Madrid"></label>
      <label>Detalles<textarea id="ta-desc" placeholder="Qué necesitas, para qué y qué entregable esperas"></textarea></label>
      <p class="error" id="ta-error"></p>
      <div class="acciones" style="margin:0"><button class="boton principal">Asignar tarea</button></div>
    </form>
    <form id="form-mensaje-agente" class="campos">
      <label>Mensaje directo<textarea id="ms-texto" placeholder="Escribe a ${esc(a.nombre.split(" ")[0])}"></textarea></label>
      <p class="error" id="ms-error"></p>
      <div class="acciones" style="margin:0"><button class="boton">Enviar mensaje</button></div>
    </form>
    <div class="acciones">
      <button class="boton" data-editar="${esc(a.id)}">Editar ficha</button>
      <button class="boton peligro" id="baja">Dar de baja</button>
    </div>
  </div>`;

  $("#form-tarea-agente", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api("POST", "/api/tareas", { asignadoA: a.id, titulo: $("#ta-titulo", d).value, descripcion: $("#ta-desc", d).value });
      d.close();
    } catch (err) {
      $("#ta-error", d).textContent = err.message;
    }
  };
  $("#form-mensaje-agente", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api("POST", "/api/mensajes", { para: a.id, texto: $("#ms-texto", d).value });
      d.close();
    } catch (err) {
      $("#ms-error", d).textContent = err.message;
    }
  };
  $("#baja", d).onclick = async (ev) => {
    if (ev.target.dataset.confirmar) {
      await api("DELETE", `/api/agentes/${a.id}`);
      d.close();
    } else {
      ev.target.dataset.confirmar = "1";
      ev.target.textContent = `Confirmar la baja de ${a.nombre.split(" ")[0]}`;
    }
  };
  d.showModal();
}

function abrirNuevaTarea(destino = "") {
  const d = $("#dialogo-agente");
  d.innerHTML = `<form class="dialogo-cuerpo" id="form-tarea">
    <div class="dialogo-cabecera"><h2>Asignar tarea</h2><button type="button" class="boton mini cerrar" data-cerrar>Cerrar</button></div>
    <label>Para<select id="nt-para">${agentes().map((a) => `<option value="${esc(a.id)}" ${a.id === destino ? "selected" : ""}>${esc(a.nombre)} · ${esc(a.cargo)}</option>`).join("")}</select></label>
    <label>Título<input id="nt-titulo" required></label>
    <label>Detalles<textarea id="nt-desc" placeholder="Qué necesitas, para qué y qué entregable esperas"></textarea></label>
    <p class="error" id="nt-error"></p>
    <div class="acciones" style="margin:0"><button class="boton principal">Asignar tarea</button></div>
  </form>`;
  $("#form-tarea", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api("POST", "/api/tareas", { asignadoA: $("#nt-para", d).value, titulo: $("#nt-titulo", d).value, descripcion: $("#nt-desc", d).value });
      d.close();
    } catch (err) {
      $("#nt-error", d).textContent = err.message;
    }
  };
  d.showModal();
}

function abrirResponder(id) {
  const d = $("#dialogo-agente");
  d.innerHTML = `<form class="dialogo-cuerpo" id="form-resp">
    <div class="dialogo-cabecera"><span class="cara">${cara(id)}</span><h2>Responder a ${esc(nombreDe(id))}</h2><button type="button" class="boton mini cerrar" data-cerrar>Cerrar</button></div>
    <label>Mensaje<textarea id="rs-texto" required></textarea></label>
    <p class="error" id="rs-error"></p>
    <div class="acciones" style="margin:0"><button class="boton principal">Enviar</button></div>
  </form>`;
  $("#form-resp", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await api("POST", "/api/mensajes", { para: id, texto: $("#rs-texto", d).value });
      d.close();
    } catch (err) {
      $("#rs-error", d).textContent = err.message;
    }
  };
  d.showModal();
}

// Formulario para incorporar (o editar) un agente, con vista previa de su cara.
function abrirFormAgente(id = null) {
  const a = id ? agente(id) : null;
  const asp = { ...aspectoPorDefecto(a?.id ?? String(Date.now())), ...(a?.avatar ?? {}) };
  const d = $("#dialogo-agente");
  const deptos = datos.equipo.departamentos;
  d.innerHTML = `<form class="dialogo-cuerpo" id="form-agente">
    <div class="dialogo-cabecera"><h2>${a ? `Editar a ${esc(a.nombre)}` : "Incorporar un agente"}</h2><button type="button" class="boton mini cerrar" data-cerrar>Cerrar</button></div>
    <div class="dos">
      <label>Nombre<input id="ag-nombre" required value="${esc(a?.nombre ?? "")}" placeholder="Ej.: Laura Gil"></label>
      <label>Cargo<input id="ag-cargo" required value="${esc(a?.cargo ?? "")}" placeholder="Ej.: Responsable de compras"></label>
    </div>
    <div class="dos">
      <label>Departamento<select id="ag-depto">${deptos.map((x) => `<option value="${esc(x.id)}" ${x.id === a?.departamento ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}<option value="__nuevo">Nuevo departamento…</option></select></label>
      <label id="ag-nuevo-wrap" hidden>Nombre del departamento<input id="ag-nuevo" placeholder="Ej.: Compras"></label>
      <label>Reporta a<select id="ag-jefe"><option value="ceo">${esc(datos.equipo.ceo.nombre)} (CEO)</option>${agentes()
        .filter((x) => x.id !== a?.id)
        .map((x) => `<option value="${esc(x.id)}" ${x.id === (a?.reportaA ?? "elena") ? "selected" : ""}>${esc(x.nombre)}</option>`)
        .join("")}</select></label>
    </div>
    <label>Responsabilidades (una por línea)<textarea id="ag-resp" required rows="4">${esc((a?.responsabilidades ?? []).join("\n"))}</textarea></label>
    <div class="dos">
      <label>Personalidad<input id="ag-pers" value="${esc(a?.personalidad ?? "")}" placeholder="Ej.: Meticuloso y negociador"></label>
      <label>Nivel de esfuerzo<select id="ag-esf">
        ${[["low", "Bajo · tareas sencillas"], ["medium", "Medio · trabajo diario"], ["high", "Alto · decisiones y análisis"], ["xhigh", "Muy alto · problemas complejos"]].map(([v, l]) => `<option value="${v}" ${v === (a?.esfuerzo ?? "medium") ? "selected" : ""}>${l}</option>`).join("")}
      </select></label>
    </div>
    <fieldset class="campos" style="border:1px solid var(--linea);border-radius:6px;padding:12px">
      <legend class="etiqueta">Aspecto</legend>
      <div class="vista-previa"><span id="ag-cara"></span>
        <div class="dos" style="flex:1">
          <label>Peinado<select id="ag-pelo">${Object.entries(PELOS).map(([v, l]) => `<option value="${v}" ${v === asp.pelo ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Tono de piel<select id="ag-piel">${PIELES.map((v, i) => `<option value="${v}" ${v === asp.piel ? "selected" : ""}>Tono ${i + 1}</option>`).join("")}</select></label>
          <label>Color de pelo<select id="ag-cpelo">${COLORES_PELO.map((v, i) => `<option value="${v}" ${v === asp.colorPelo ? "selected" : ""}>${["Negro", "Castaño oscuro", "Castaño", "Castaño claro", "Cobrizo", "Rubio", "Gris", "Canoso"][i]}</option>`).join("")}</select></label>
          <label style="display:flex;gap:16px;align-items:center;font-weight:600">
            <span><input type="checkbox" id="ag-gafas" ${asp.gafas ? "checked" : ""} style="width:auto"> Gafas</span>
            <span><input type="checkbox" id="ag-barba" ${asp.barba ? "checked" : ""} style="width:auto"> Barba</span>
          </label>
        </div>
      </div>
    </fieldset>
    <p class="error" id="ag-error"></p>
    <div class="acciones" style="margin:0"><button class="boton principal">${a ? "Guardar cambios" : "Incorporar al equipo"}</button></div>
  </form>`;

  const aspecto = () => ({
    pelo: $("#ag-pelo", d).value,
    piel: $("#ag-piel", d).value,
    colorPelo: $("#ag-cpelo", d).value,
    gafas: $("#ag-gafas", d).checked,
    barba: $("#ag-barba", d).checked,
  });
  const previa = () => {
    $("#ag-cara", d).innerHTML = caraSvg({ id: a?.id ?? "nuevo", nombre: $("#ag-nombre", d).value, departamento: $("#ag-depto", d).value, avatar: aspecto() });
  };
  d.querySelectorAll("select, input").forEach((el) => el.addEventListener("input", previa));
  $("#ag-depto", d).addEventListener("input", () => ($("#ag-nuevo-wrap", d).hidden = $("#ag-depto", d).value !== "__nuevo"));
  previa();

  $("#form-agente", d).onsubmit = async (ev) => {
    ev.preventDefault();
    const depto = $("#ag-depto", d).value === "__nuevo" ? $("#ag-nuevo", d).value.trim() : $("#ag-depto", d).value;
    const cuerpo = {
      nombre: $("#ag-nombre", d).value,
      cargo: $("#ag-cargo", d).value,
      departamento: depto,
      reportaA: $("#ag-jefe", d).value,
      responsabilidades: $("#ag-resp", d).value,
      personalidad: $("#ag-pers", d).value,
      esfuerzo: $("#ag-esf", d).value,
      avatar: aspecto(),
    };
    try {
      if (!depto) throw new Error("Escribe el nombre del nuevo departamento.");
      if (a) {
        await api("PUT", `/api/agentes/${a.id}`, cuerpo);
      } else {
        if ($("#ag-depto", d).value === "__nuevo" && datos.modo !== "demo") {
          const nuevo = await api("POST", "/api/departamentos", { nombre: depto });
          cuerpo.departamento = nuevo.id;
        }
        await api("POST", "/api/agentes", cuerpo);
      }
      d.close();
    } catch (err) {
      $("#ag-error", d).textContent = err.message;
    }
  };
  d.showModal();
}

// ---------- Eventos ----------
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("button, [data-agente]");
  if (!t) return;
  try {
    if (t.dataset.pestana) {
      pestana = t.dataset.pestana;
      history.replaceState(null, "", `#${pestana}`);
      render();
    } else if (t.dataset.agente) abrirAgente(t.dataset.agente);
    else if (t.hasAttribute("data-cerrar")) t.closest("dialog").close();
    else if (t.dataset.editar) abrirFormAgente(t.dataset.editar);
    else if (t.dataset.accion === "nueva-tarea") abrirNuevaTarea();
    else if (t.dataset.accion === "nuevo-agente") abrirFormAgente();
    else if (t.dataset.accion === "pausa") await api("POST", "/api/pausa", { pausado: !datos.estado.pausado });
    else if (t.dataset.accion === "marcar-leidos") await api("POST", "/api/mensajes/leidos");
    else if (t.dataset.responder) abrirResponder(t.dataset.responder);
    else if (t.dataset.aprobar) {
      const comentario = $(`#comentario-${t.dataset.aprobar}`)?.value ?? "";
      await api("POST", `/api/aprobaciones/${t.dataset.aprobar}`, { decision: t.dataset.decision, comentario });
    } else if (t.dataset.borrador) await api("POST", `/api/borradores/${t.dataset.borrador}`, { estado: t.dataset.estado });
    else if (t.dataset.copiar) {
      const el = $(`#texto-${t.dataset.copiar}`);
      try {
        await navigator.clipboard.writeText(el.textContent);
        t.textContent = "Copiado";
      } catch {
        getSelection().selectAllChildren(el);
        t.textContent = "Texto seleccionado";
      }
    }
  } catch (err) {
    console.error(err);
  }
});

document.addEventListener("change", async (ev) => {
  if (ev.target.matches(".cambiar-etapa")) {
    await api("POST", `/api/oportunidades/${ev.target.dataset.op}`, { etapa: ev.target.value });
    ev.target.blur();
    render();
  }
});

$("#dialogo-agente").addEventListener("close", () => render());

// Avisos en tiempo real desde el servidor.
function escuchar() {
  if (datos.modo === "demo" || !window.EventSource) return;
  let espera;
  const es = new EventSource("/api/eventos");
  es.addEventListener("cambio", () => {
    clearTimeout(espera);
    espera = setTimeout(cargar, 250);
  });
}

cargar().then(escuchar);
setInterval(() => datos.modo !== "demo" && render(), 60_000);
