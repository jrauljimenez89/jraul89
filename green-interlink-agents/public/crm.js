// CRM de Green Interlink: negocios, empresas y contactos.
// Usa las utilidades de app.js ($, esc, euros, hace, personaMini, render...).

const ETAPAS_CRM = [
  ["nuevo", "Nuevo"],
  ["contactado", "Contactado"],
  ["reunion", "Reunión"],
  ["propuesta", "Propuesta"],
  ["negociacion", "Negociación"],
  ["ganado", "Ganado"],
  ["perdido", "Perdido"],
];
const ABIERTAS = ETAPAS_CRM.slice(0, 5).map(([id]) => id);
const NOMBRE_ETAPA = Object.fromEntries(ETAPAS_CRM);
const TIPOS_EMPRESA_CRM = { cliente: "Cliente", prospecto: "Prospecto", socio: "Socio", proveedor: "Proveedor", otro: "Otro" };
const TIPOS_ACT = { nota: "Nota", llamada: "Llamada", email: "Email", reunion: "Reunión", linkedin: "LinkedIn", tarea: "Tarea" };
const MOTIVOS_PERDIDA = ["Precio", "Eligió a la competencia", "Sin presupuesto", "Sin respuesta", "No era el momento", "No encajaba con lo que hacemos", "Otro"];

const crmUi = { vista: "negocios", q: "", tipo: "", sinActividad: "", limite: 50 };
let crmCache = { resumen: null, negocios: [], empresas: null, contactos: null, importacion: null };

const hoyIso = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (f) => (f ? new Date(f.length === 10 ? `${f}T12:00:00` : f).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "");
const responsable = (id) => (id ? personaMini(id) : `<span class="tenue">Sin responsable</span>`);

// ---------- Acceso a datos (servidor o demostración) ----------
async function crmApi(metodo, ruta, cuerpo) {
  if (datos.modo === "demo") return demoCrm(metodo, ruta, cuerpo ?? {});
  const r = await fetch(ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || "No se pudo completar la acción.");
  return json;
}

async function cargarCrm() {
  if (!["activo", "vista", "demo"].includes(datos.modo)) return;
  try {
    const { resumen, negocios } = await crmApi("GET", "/api/crm/resumen");
    crmCache.resumen = resumen;
    crmCache.negocios = negocios;
    const filtros = new URLSearchParams({ q: crmUi.q, limite: String(crmUi.limite) });
    if (crmUi.vista === "empresas") {
      if (crmUi.tipo) filtros.set("tipo", crmUi.tipo);
      if (crmUi.sinActividad) filtros.set("sinActividad", crmUi.sinActividad);
      crmCache.empresas = await crmApi("GET", `/api/crm/empresas?${filtros}`);
    }
    if (crmUi.vista === "contactos") crmCache.contactos = await crmApi("GET", `/api/crm/contactos?${filtros}`);
    if (datos.modo !== "demo") crmCache.importacion = await crmApi("GET", "/api/crm/importacion");
  } catch (err) {
    console.error(err);
  }
  if (pestana === "crm") pintarCrm();
}

// Repinta solo el cuerpo del CRM para no perder lo que se está escribiendo en el buscador.
function pintarCrm() {
  const cuerpo = $("#crm-cuerpo");
  if (!cuerpo) return render();
  $("#crm-kpis").innerHTML = renderKpis();
  cuerpo.innerHTML = { negocios: renderNegociosCrm, empresas: renderEmpresasCrm, contactos: renderContactosCrm }[crmUi.vista]();
  const imp = $("#crm-importacion");
  if (imp) imp.innerHTML = renderImportacion();
}

// ---------- Vista principal ----------
function renderCrm() {
  if (!crmCache.resumen) cargarCrm();
  const vistas = [
    ["negocios", "Negocios"],
    ["empresas", "Empresas"],
    ["contactos", "Contactos"],
  ];
  const buscador =
    crmUi.vista === "negocios"
      ? ""
      : `<div class="crm-filtros">
          <input id="crm-q" type="search" value="${esc(crmUi.q)}" placeholder="${crmUi.vista === "empresas" ? "Buscar por nombre, sector, ciudad…" : "Buscar por nombre, cargo, email o empresa…"}" aria-label="Buscar">
          ${
            crmUi.vista === "empresas"
              ? `<select id="crm-tipo" aria-label="Tipo de empresa"><option value="">Todos los tipos</option>${Object.entries(TIPOS_EMPRESA_CRM).map(([v, l]) => `<option value="${v}" ${v === crmUi.tipo ? "selected" : ""}>${l}</option>`).join("")}</select>
                 <select id="crm-sin" aria-label="Actividad"><option value="">Cualquier actividad</option>${[[90, "Sin actividad en 3 meses"], [180, "Sin actividad en 6 meses"], [365, "Sin actividad en 1 año"]].map(([v, l]) => `<option value="${v}" ${String(v) === crmUi.sinActividad ? "selected" : ""}>${l}</option>`).join("")}</select>`
              : ""
          }
        </div>`;
  return `<div class="crm">
    <div class="crm-barra">
      <div class="segmentos" role="tablist">${vistas.map(([v, l]) => `<button role="tab" data-crm-vista="${v}" aria-selected="${v === crmUi.vista}">${l}</button>`).join("")}</div>
      <div class="acciones" style="margin:0">
        <button class="boton principal" data-crm="nuevo-negocio">Nuevo negocio</button>
        <button class="boton" data-crm="nueva-empresa">Nueva empresa</button>
      </div>
    </div>
    <div class="kpis" id="crm-kpis">${renderKpis()}</div>
    ${datos.modo === "demo" ? "" : `<div id="crm-importacion">${renderImportacion()}</div>`}
    ${buscador}
    <div id="crm-cuerpo">${{ negocios: renderNegociosCrm, empresas: renderEmpresasCrm, contactos: renderContactosCrm }[crmUi.vista]()}</div>
  </div>`;
}

function renderKpis() {
  const r = crmCache.resumen;
  if (!r) return `<p class="tenue">Cargando el CRM…</p>`;
  const tiles = [
    ["Negocios abiertos", `${r.abiertos}`, euros(r.valorAbierto), ""],
    ["Previsión ponderada", euros(r.valorPonderado), "según la etapa de cada negocio", ""],
    ["Ganado este mes", euros(r.valorGanadoMes), `${r.ganadosMes} negocio${r.ganadosMes === 1 ? "" : "s"}`, r.ganadosMes ? "bien" : ""],
    ["Tasa de cierre", r.tasaCierre === null ? "—" : `${r.tasaCierre} %`, "últimos 90 días", ""],
    ["Próximos pasos", `${r.pasosVencidos} vencidos`, `${r.sinProximoPaso} sin próximo paso`, r.pasosVencidos || r.sinProximoPaso ? "atencion" : "bien"],
  ];
  return tiles
    .map(([t, v, s, clase]) => `<div class="kpi ${clase}"><span class="etiqueta">${t}</span><strong>${esc(v)}</strong><span class="tenue">${esc(s)}</span></div>`)
    .join("");
}

function renderImportacion() {
  const i = crmCache.importacion;
  if (!i) return "";
  if (i.estado === "en_curso") {
    return `<p class="aviso-modo">Importando de HubSpot · ${esc(i.fase ?? "")} · ${i.empresas ?? 0} empresas, ${i.contactos ?? 0} contactos, ${i.negocios ?? 0} negocios, ${i.notas ?? 0} notas</p>`;
  }
  if (i.estado === "error") return `<p class="aviso-modo">La importación de HubSpot falló: ${esc(i.error)}</p>`;
  if (crmCache.resumen?.empresas === 0) {
    return i.tokenConfigurado
      ? `<div class="aviso-modo acciones" style="margin:0 0 16px;align-items:center">Tu CRM está vacío. ¿Traemos tu base de HubSpot? <button class="boton principal mini" data-crm="importar">Importar desde HubSpot</button></div>`
      : `<p class="aviso-modo">Tu CRM está vacío. Para traer tu base de HubSpot, añade <code>HUBSPOT_TOKEN</code> al archivo <code>.env</code> (lo explica el README) y reinicia la oficina.</p>`;
  }
  return "";
}

// ---------- Negocios ----------
function tarjetaNegocio(n) {
  const hoy = hoyIso();
  const abierto = ABIERTAS.includes(n.etapa);
  let paso = "";
  if (abierto) {
    if (!n.proximo_paso_fecha) paso = `<p class="paso alerta">Sin próximo paso</p>`;
    else
      paso = `<p class="paso ${n.proximo_paso_fecha < hoy ? "alerta" : n.proximo_paso_fecha === hoy ? "hoy" : ""}">${esc(n.proximo_paso ?? "Próximo paso")} · <span class="dato">${n.proximo_paso_fecha < hoy ? "vencido " : ""}${fechaCorta(n.proximo_paso_fecha)}</span></p>`;
  } else if (n.motivo_cierre) {
    paso = `<p class="tenue">${esc(n.motivo_cierre)}</p>`;
  }
  return `<article class="tarjeta negocio" draggable="${abierto}" data-negocio="${n.id}" tabindex="0">
    <h4>${esc(n.titulo)}</h4>
    <p class="tenue">${esc(n.empresa ?? "Sin empresa")}${n.contacto ? ` · ${esc(n.contacto)}` : ""}</p>
    ${paso}
    <div class="pie"><span class="dato valor">${euros(n.valor)}</span>${responsable(n.responsable)}</div>
  </article>`;
}

function renderNegociosCrm() {
  const negocios = crmCache.negocios;
  if (!crmCache.resumen) return "";
  if (!negocios.length) {
    return `<p class="vacio">Aún no hay negocios. Crea el primero con «Nuevo negocio» o importa tu base de HubSpot.</p>`;
  }
  const cols = ETAPAS_CRM.map(([id, titulo]) => {
    const lista = negocios.filter((n) => n.etapa === id);
    const suma = lista.reduce((s, n) => s + (n.valor ?? 0), 0);
    return `<section class="columna etapa-${id}" data-etapa="${id}">
      <div class="columna-cabecera"><h3>${titulo}</h3><span class="dato tenue">${lista.length} · ${euros(suma)}</span></div>
      ${["ganado", "perdido"].includes(id) ? `<p class="dato tenue" style="margin:-6px 0 8px">últimos 90 días</p>` : ""}
      <div class="tarjetas">${lista.map(tarjetaNegocio).join("")}</div>
    </section>`;
  }).join("");
  return `<div class="tablero crm-tablero">${cols}</div>`;
}

// ---------- Empresas y contactos ----------
function renderEmpresasCrm() {
  const r = crmCache.empresas;
  if (!r) return `<p class="tenue">Cargando…</p>`;
  if (!r.filas.length) return `<p class="vacio">No hay empresas que coincidan.</p>`;
  return `<p class="dato tenue">${r.total.toLocaleString("es-ES")} empresa${r.total === 1 ? "" : "s"}</p>
  <div class="tabla-contenedor"><table class="tabla">
    <thead><tr><th>Empresa</th><th>Tipo</th><th>Sector</th><th>Ubicación</th><th class="num">Contactos</th><th class="num">Negocios abiertos</th><th class="num">Ganado</th><th>Última actividad</th></tr></thead>
    <tbody>${r.filas
      .map(
        (e) => `<tr data-empresa="${e.id}" tabindex="0">
        <td><strong>${esc(e.nombre)}</strong></td>
        <td><span class="chip tipo-${esc(e.tipo)}">${esc(TIPOS_EMPRESA_CRM[e.tipo] ?? e.tipo ?? "")}</span></td>
        <td>${esc(e.sector ?? "")}</td>
        <td>${esc([e.ciudad, e.pais].filter(Boolean).join(", "))}</td>
        <td class="num dato">${e.contactos}</td>
        <td class="num dato">${e.negocios_abiertos}</td>
        <td class="num dato">${e.valor_ganado ? euros(e.valor_ganado) : "—"}</td>
        <td class="dato tenue">${e.ultima_actividad ? hace(e.ultima_actividad) : "nunca"}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table></div>
  ${r.total > r.filas.length ? `<div class="acciones"><button class="boton" data-crm="mas">Ver más (${(r.total - r.filas.length).toLocaleString("es-ES")} restantes)</button></div>` : ""}`;
}

function renderContactosCrm() {
  const r = crmCache.contactos;
  if (!r) return `<p class="tenue">Cargando…</p>`;
  if (!r.filas.length) return `<p class="vacio">No hay contactos que coincidan.</p>`;
  return `<p class="dato tenue">${r.total.toLocaleString("es-ES")} contacto${r.total === 1 ? "" : "s"}</p>
  <div class="tabla-contenedor"><table class="tabla">
    <thead><tr><th>Nombre</th><th>Cargo</th><th>Empresa</th><th>Email</th><th>Teléfono</th><th>Comunicaciones</th></tr></thead>
    <tbody>${r.filas
      .map(
        (c) => `<tr ${c.empresa_id ? `data-empresa="${c.empresa_id}" tabindex="0"` : ""}>
        <td><strong>${esc([c.nombre, c.apellidos].filter(Boolean).join(" "))}</strong></td>
        <td>${esc(c.cargo ?? "")}</td>
        <td>${esc(c.empresa ?? "")}</td>
        <td class="dato">${esc(c.email ?? "")}</td>
        <td class="dato">${esc(c.telefono ?? "")}</td>
        <td>${c.consentimiento === "baja" ? `<span class="chip alerta">No contactar</span>` : c.consentimiento === "si" ? `<span class="chip">Acepta</span>` : `<span class="tenue">—</span>`}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table></div>
  ${r.total > r.filas.length ? `<div class="acciones"><button class="boton" data-crm="mas">Ver más (${(r.total - r.filas.length).toLocaleString("es-ES")} restantes)</button></div>` : ""}`;
}

// ---------- Historial ----------
function renderHistorial(actividades) {
  if (!actividades.length) return `<p class="vacio">Sin actividad registrada.</p>`;
  return `<ol class="historial">${actividades
    .map(
      (a) => `<li><span class="chip">${esc(TIPOS_ACT[a.tipo] ?? a.tipo)}</span>
      <div><p>${esc(a.texto)}</p><span class="dato tenue">${a.autor === "hubspot" ? "HubSpot" : esc(nombreCorto(a.autor ?? ""))} · ${hace(a.fecha)}</span></div></li>`,
    )
    .join("")}</ol>`;
}

function formActividad(idForm) {
  return `<form class="campos" id="${idForm}">
    <div class="fila-actividad">
      <select id="${idForm}-tipo" aria-label="Tipo de actividad">${Object.entries(TIPOS_ACT).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <input id="${idForm}-texto" placeholder="¿Qué ha pasado? Ej.: Llamada con Ana, quiere propuesta para enero" aria-label="Actividad">
      <button class="boton">Añadir</button>
    </div>
    <p class="error" id="${idForm}-error"></p>
  </form>`;
}

function conectarActividad(d, idForm, base) {
  $(`#${idForm}`, d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await crmApi("POST", "/api/crm/actividades", { ...base, tipo: $(`#${idForm}-tipo`, d).value, texto: $(`#${idForm}-texto`, d).value });
      return true;
    } catch (err) {
      $(`#${idForm}-error`, d).textContent = err.message;
      return false;
    }
  };
}

// ---------- Ficha de negocio ----------
async function abrirNegocio(id) {
  const d = $("#dialogo-agente");
  const f = await crmApi("GET", `/api/crm/negocios/${id}`);
  const n = f.negocio;
  const abierto = ABIERTAS.includes(n.etapa);
  d.innerHTML = `<div class="dialogo-cuerpo">
    <div class="dialogo-cabecera">
      <div style="min-width:0"><span class="etiqueta">Negocio · ${esc(NOMBRE_ETAPA[n.etapa])}</span><h2>${esc(n.titulo)}</h2>
        <div class="tenue">${n.empresa_id ? `<button class="enlace" data-empresa="${n.empresa_id}">${esc(n.empresa)}</button>` : "Sin empresa"}${n.contacto ? ` · ${esc(n.contacto)}` : ""}</div></div>
      <button class="boton mini cerrar" data-cerrar>Cerrar</button>
    </div>

    ${
      abierto
        ? `<div class="etapas" role="group" aria-label="Etapa">${ABIERTAS.map((e) => `<button class="etapa ${e === n.etapa ? "actual" : ""}" data-mover="${e}">${NOMBRE_ETAPA[e]}</button>`).join("")}</div>
      <div class="cierre">
        <button class="boton ganar" data-cerrar-como="ganado">Marcar como ganado</button>
        <button class="boton peligro" data-cerrar-como="perdido">Marcar como perdido</button>
      </div>
      <form class="campos" id="form-cierre" hidden>
        <label id="cierre-etq">Motivo<select id="cierre-motivo">${MOTIVOS_PERDIDA.map((m) => `<option>${m}</option>`).join("")}</select></label>
        <label>Comentario<input id="cierre-comentario" placeholder="Opcional"></label>
        <div class="acciones" style="margin:0"><button class="boton principal" id="cierre-confirmar">Confirmar</button><button type="button" class="boton" id="cierre-cancelar">Cancelar</button></div>
      </form>`
        : `<div class="resultado-cierre ${n.etapa}"><strong>${n.etapa === "ganado" ? "Ganado" : "Perdido"}</strong> ${n.cerrado ? `el ${fechaCorta(n.cerrado)}` : ""}${n.motivo_cierre ? ` · ${esc(n.motivo_cierre)}` : ""}
           <button class="boton mini" data-mover="negociacion">Reabrir</button></div>`
    }

    <form class="campos" id="form-negocio">
      <div class="dos">
        <label>Valor anual (€)<input id="ng-valor" type="number" min="0" step="100" value="${n.valor ?? ""}"></label>
        <label>Cierre previsto<input id="ng-cierre" type="date" value="${esc(n.cierre_previsto ?? "")}"></label>
      </div>
      <div class="dos">
        <label>Próximo paso<input id="ng-paso" value="${esc(n.proximo_paso ?? "")}" placeholder="Ej.: Enviar propuesta revisada"></label>
        <label>Fecha<input id="ng-paso-fecha" type="date" value="${esc(n.proximo_paso_fecha ?? "")}"></label>
      </div>
      <div class="dos">
        <label>Contacto<select id="ng-contacto"><option value="">Sin contacto</option>${f.contactos.map((c) => `<option value="${c.id}" ${c.id === n.contacto_id ? "selected" : ""}>${esc([c.nombre, c.apellidos].filter(Boolean).join(" "))}${c.cargo ? ` · ${esc(c.cargo)}` : ""}${c.consentimiento === "baja" ? " (no contactar)" : ""}</option>`).join("")}</select></label>
        <label>Responsable<select id="ng-resp">${opcionesResponsable(n.responsable)}</select></label>
      </div>
      <p class="error" id="ng-error"></p>
      <div class="acciones" style="margin:0"><button class="boton">Guardar cambios</button></div>
    </form>

    <div><div class="seccion-titulo">Historial</div>${formActividad("act-negocio")}${renderHistorial(f.actividades)}</div>
  </div>`;

  const guardar = async (cambios) => {
    try {
      await crmApi("PUT", `/api/crm/negocios/${n.id}`, cambios);
      await cargarCrm();
      abrirNegocio(n.id);
    } catch (err) {
      $("#ng-error", d).textContent = err.message;
    }
  };

  d.querySelectorAll("[data-mover]").forEach((b) => (b.onclick = () => guardar({ etapa: b.dataset.mover, motivo_cierre: null })));

  const formCierre = $("#form-cierre", d);
  let cierreComo = null;
  d.querySelectorAll("[data-cerrar-como]").forEach(
    (b) =>
      (b.onclick = () => {
        cierreComo = b.dataset.cerrarComo;
        formCierre.hidden = false;
        $("#cierre-etq", d).hidden = cierreComo === "ganado";
        $("#cierre-confirmar", d).textContent = cierreComo === "ganado" ? "Confirmar: negocio ganado" : "Confirmar: negocio perdido";
      }),
  );
  if (formCierre) {
    $("#cierre-cancelar", d).onclick = () => (formCierre.hidden = true);
    formCierre.onsubmit = (ev) => {
      ev.preventDefault();
      const comentario = $("#cierre-comentario", d).value.trim();
      const motivo = cierreComo === "perdido" ? [$("#cierre-motivo", d).value, comentario].filter(Boolean).join(": ") : comentario;
      guardar({ etapa: cierreComo, motivo_cierre: motivo || null, proximo_paso: null, proximo_paso_fecha: null });
    };
  }

  $("#form-negocio", d).onsubmit = (ev) => {
    ev.preventDefault();
    guardar({
      valor: $("#ng-valor", d).value || null,
      cierre_previsto: $("#ng-cierre", d).value || null,
      proximo_paso: $("#ng-paso", d).value,
      proximo_paso_fecha: $("#ng-paso-fecha", d).value || null,
      contacto_id: $("#ng-contacto", d).value || null,
      responsable: $("#ng-resp", d).value,
    });
  };

  conectarActividad(d, "act-negocio", { negocio_id: n.id, empresa_id: n.empresa_id });
  const envio = $("#act-negocio", d).onsubmit;
  $("#act-negocio", d).onsubmit = async (ev) => {
    if (await envio(ev)) abrirNegocio(n.id);
  };
  if (!d.open) d.showModal();
}

function opcionesResponsable(actual) {
  const comerciales = agentes().filter((a) => ["ventas", "direccion"].includes(a.departamento));
  const opciones = [["ceo", `${datos.equipo.ceo.nombre} (tú)`], ...comerciales.map((a) => [a.id, `${a.nombre} · ${a.cargo}`])];
  if (actual && !opciones.some(([v]) => v === actual)) opciones.push([actual, nombreDe(actual)]);
  return opciones.map(([v, l]) => `<option value="${esc(v)}" ${v === (actual ?? "ceo") ? "selected" : ""}>${esc(l)}</option>`).join("");
}

// ---------- Ficha de empresa ----------
async function abrirEmpresa(id) {
  const d = $("#dialogo-agente");
  const f = await crmApi("GET", `/api/crm/empresas/${id}`);
  const e = f.empresa;
  const abiertos = f.negocios.filter((n) => ABIERTAS.includes(n.etapa));
  const ganado = f.negocios.filter((n) => n.etapa === "ganado").reduce((s, n) => s + (n.valor ?? 0), 0);
  d.innerHTML = `<div class="dialogo-cuerpo">
    <div class="dialogo-cabecera">
      <div style="min-width:0"><span class="etiqueta">${esc(TIPOS_EMPRESA_CRM[e.tipo] ?? "Empresa")}</span><h2>${esc(e.nombre)}</h2>
        <div class="tenue">${esc([e.sector, e.ciudad, e.pais].filter(Boolean).join(" · "))}</div>
        <div class="dato tenue">${[e.web, e.telefono].filter(Boolean).map(esc).join(" · ")}</div></div>
      <button class="boton mini cerrar" data-cerrar>Cerrar</button>
    </div>
    <div class="kpis mini">
      <div class="kpi"><span class="etiqueta">Negocios abiertos</span><strong>${abiertos.length}</strong><span class="tenue">${euros(abiertos.reduce((s, n) => s + (n.valor ?? 0), 0))}</span></div>
      <div class="kpi"><span class="etiqueta">Ganado en total</span><strong>${euros(ganado)}</strong></div>
      <div class="kpi"><span class="etiqueta">Contactos</span><strong>${f.contactos.length}</strong></div>
    </div>
    ${e.notas ? `<p class="resultado completo">${esc(e.notas)}</p>` : ""}

    <div>
      <div class="seccion-cabecera"><span class="seccion-titulo">Negocios</span><button class="boton mini principal" data-crm="nuevo-negocio" data-empresa-id="${e.id}" data-empresa-nombre="${esc(e.nombre)}">Nuevo negocio</button></div>
      <div class="lista">${
        f.negocios
          .map(
            (n) => `<button class="fila-negocio" data-negocio="${n.id}"><span><strong>${esc(n.titulo)}</strong><br><span class="tenue">${esc(NOMBRE_ETAPA[n.etapa])}${n.proximo_paso ? ` · ${esc(n.proximo_paso)}` : ""}</span></span><span class="dato">${euros(n.valor)}</span></button>`,
          )
          .join("") || `<p class="vacio">Sin negocios todavía.</p>`
      }</div>
    </div>

    <div>
      <div class="seccion-cabecera"><span class="seccion-titulo">Contactos</span><button class="boton mini" id="nuevo-contacto">Añadir contacto</button></div>
      <form class="campos" id="form-contacto" hidden>
        <div class="dos"><label>Nombre<input id="ct-nombre" required></label><label>Apellidos<input id="ct-apellidos"></label></div>
        <div class="dos"><label>Cargo<input id="ct-cargo"></label><label>Email<input id="ct-email" type="email"></label></div>
        <div class="dos"><label>Teléfono<input id="ct-telefono"></label><label>LinkedIn<input id="ct-linkedin" placeholder="URL del perfil"></label></div>
        <p class="error" id="ct-error"></p>
        <div class="acciones" style="margin:0"><button class="boton principal">Guardar contacto</button></div>
      </form>
      <div class="lista">${
        f.contactos
          .map(
            (c) => `<div class="fila-contacto">
              <span><strong>${esc([c.nombre, c.apellidos].filter(Boolean).join(" "))}</strong>${c.cargo ? ` · ${esc(c.cargo)}` : ""}<br>
              <span class="dato tenue">${[c.email, c.telefono].filter(Boolean).map(esc).join(" · ")}</span></span>
              ${c.consentimiento === "baja" ? `<span class="chip alerta">No contactar</span>` : ""}
            </div>`,
          )
          .join("") || `<p class="vacio">Sin contactos.</p>`
      }</div>
    </div>

    <div><div class="seccion-titulo">Historial</div>${formActividad("act-empresa")}${renderHistorial(f.actividades)}</div>

    <details>
      <summary class="seccion-titulo">Editar datos de la empresa</summary>
      <form class="campos" id="form-empresa-editar" style="margin-top:10px">${camposEmpresa(e)}
        <p class="error" id="em-error"></p>
        <div class="acciones" style="margin:0"><button class="boton">Guardar cambios</button></div>
      </form>
    </details>
  </div>`;

  $("#nuevo-contacto", d).onclick = () => ($("#form-contacto", d).hidden = false);
  $("#form-contacto", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await crmApi("POST", "/api/crm/contactos", {
        empresa_id: e.id,
        nombre: $("#ct-nombre", d).value,
        apellidos: $("#ct-apellidos", d).value,
        cargo: $("#ct-cargo", d).value,
        email: $("#ct-email", d).value,
        telefono: $("#ct-telefono", d).value,
        linkedin: $("#ct-linkedin", d).value,
      });
      abrirEmpresa(e.id);
    } catch (err) {
      $("#ct-error", d).textContent = err.message;
    }
  };
  $("#form-empresa-editar", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      await crmApi("PUT", `/api/crm/empresas/${e.id}`, leerCamposEmpresa(d));
      await cargarCrm();
      abrirEmpresa(e.id);
    } catch (err) {
      $("#em-error", d).textContent = err.message;
    }
  };
  conectarActividad(d, "act-empresa", { empresa_id: e.id });
  const envio = $("#act-empresa", d).onsubmit;
  $("#act-empresa", d).onsubmit = async (ev) => {
    if (await envio(ev)) abrirEmpresa(e.id);
  };
  if (!d.open) d.showModal();
}

function camposEmpresa(e = {}) {
  return `<div class="dos"><label>Nombre<input id="em-nombre" required value="${esc(e.nombre ?? "")}"></label>
      <label>Tipo<select id="em-tipo">${Object.entries(TIPOS_EMPRESA_CRM).map(([v, l]) => `<option value="${v}" ${v === (e.tipo ?? "prospecto") ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    <div class="dos"><label>Sector<input id="em-sector" value="${esc(e.sector ?? "")}" placeholder="Ej.: Instalaciones de telecomunicaciones"></label>
      <label>Web<input id="em-web" value="${esc(e.web ?? "")}"></label></div>
    <div class="dos"><label>Ciudad<input id="em-ciudad" value="${esc(e.ciudad ?? "")}"></label>
      <label>País<input id="em-pais" value="${esc(e.pais ?? "")}"></label></div>
    <div class="dos"><label>Teléfono<input id="em-telefono" value="${esc(e.telefono ?? "")}"></label></div>
    <label>Notas<textarea id="em-notas">${esc(e.notas ?? "")}</textarea></label>`;
}

function leerCamposEmpresa(d) {
  const v = (id) => $(`#${id}`, d).value;
  return { nombre: v("em-nombre"), tipo: v("em-tipo"), sector: v("em-sector"), web: v("em-web"), ciudad: v("em-ciudad"), pais: v("em-pais"), telefono: v("em-telefono"), notas: v("em-notas") };
}

function abrirNuevaEmpresa() {
  const d = $("#dialogo-agente");
  d.innerHTML = `<form class="dialogo-cuerpo" id="form-empresa">
    <div class="dialogo-cabecera"><h2>Nueva empresa</h2><button type="button" class="boton mini cerrar" data-cerrar>Cerrar</button></div>
    ${camposEmpresa()}
    <p class="error" id="em-error"></p>
    <div class="acciones" style="margin:0"><button class="boton principal">Crear empresa</button></div>
  </form>`;
  $("#form-empresa", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const e = await crmApi("POST", "/api/crm/empresas", leerCamposEmpresa(d));
      await cargarCrm();
      abrirEmpresa(e.id);
    } catch (err) {
      $("#em-error", d).textContent = err.message;
    }
  };
  d.showModal();
}

// ---------- Nuevo negocio (con búsqueda de empresa) ----------
function abrirNuevoNegocio(empresaId = null, empresaNombre = "") {
  const d = $("#dialogo-agente");
  let elegida = empresaId ? { id: Number(empresaId), nombre: empresaNombre } : null;
  d.innerHTML = `<form class="dialogo-cuerpo" id="form-nn">
    <div class="dialogo-cabecera"><h2>Nuevo negocio</h2><button type="button" class="boton mini cerrar" data-cerrar>Cerrar</button></div>
    <label>Qué vendemos<input id="nn-titulo" required placeholder="Ej.: Recogida trimestral de equipos de red"></label>
    <label>Empresa<input id="nn-empresa" autocomplete="off" value="${esc(empresaNombre)}" placeholder="Escribe para buscar o para crear una nueva"></label>
    <div class="sugerencias" id="nn-sugerencias"></div>
    <div class="dos">
      <label>Valor anual (€)<input id="nn-valor" type="number" min="0" step="100"></label>
      <label>Etapa<select id="nn-etapa">${ABIERTAS.map((e) => `<option value="${e}">${NOMBRE_ETAPA[e]}</option>`).join("")}</select></label>
    </div>
    <div class="dos">
      <label>Próximo paso<input id="nn-paso" placeholder="Ej.: Llamar para entender volúmenes"></label>
      <label>Fecha<input id="nn-paso-fecha" type="date" value="${hoyIso()}"></label>
    </div>
    <label>Responsable<select id="nn-resp">${opcionesResponsable("ceo")}</select></label>
    <p class="error" id="nn-error"></p>
    <div class="acciones" style="margin:0"><button class="boton principal">Crear negocio</button></div>
  </form>`;

  const input = $("#nn-empresa", d);
  const sug = $("#nn-sugerencias", d);
  let temporizador;
  input.addEventListener("input", () => {
    elegida = null;
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) return (sug.innerHTML = "");
      const r = await crmApi("GET", `/api/crm/empresas?q=${encodeURIComponent(q)}&limite=6`);
      sug.innerHTML =
        r.filas.map((e) => `<button type="button" data-elegir="${e.id}" data-nombre="${esc(e.nombre)}">${esc(e.nombre)} <span class="tenue">${esc(e.ciudad ?? "")}</span></button>`).join("") +
        `<button type="button" data-elegir="nueva">Crear «${esc(q)}» como empresa nueva</button>`;
    }, 200);
  });
  sug.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-elegir]");
    if (!b) return;
    elegida = b.dataset.elegir === "nueva" ? { nueva: true, nombre: input.value.trim() } : { id: Number(b.dataset.elegir), nombre: b.dataset.nombre };
    input.value = elegida.nombre;
    sug.innerHTML = elegida.nueva ? `<p class="dato tenue">Se creará la empresa al guardar.</p>` : "";
  });

  $("#form-nn", d).onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      if (input.value.trim() && !elegida) throw new Error("Elige una empresa de la lista o créala como nueva.");
      let empresa_id = elegida?.id ?? null;
      if (elegida?.nueva) empresa_id = (await crmApi("POST", "/api/crm/empresas", { nombre: elegida.nombre })).id;
      const n = await crmApi("POST", "/api/crm/negocios", {
        titulo: $("#nn-titulo", d).value,
        empresa_id,
        valor: $("#nn-valor", d).value || null,
        etapa: $("#nn-etapa", d).value,
        proximo_paso: $("#nn-paso", d).value,
        proximo_paso_fecha: $("#nn-paso-fecha", d).value || null,
        responsable: $("#nn-resp", d).value,
      });
      await cargarCrm();
      abrirNegocio(n.id);
    } catch (err) {
      $("#nn-error", d).textContent = err.message;
    }
  };
  if (!d.open) d.showModal();
  else $("#nn-titulo", d).focus();
}

// ---------- Eventos ----------
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-crm-vista], [data-crm], [data-negocio], [data-empresa]");
  if (!t) return;
  try {
    if (t.dataset.crmVista) {
      Object.assign(crmUi, { vista: t.dataset.crmVista, q: "", tipo: "", sinActividad: "", limite: 50 });
      render();
      cargarCrm();
    } else if (t.dataset.crm === "nuevo-negocio") abrirNuevoNegocio(t.dataset.empresaId, t.dataset.empresaNombre ?? "");
    else if (t.dataset.crm === "nueva-empresa") abrirNuevaEmpresa();
    else if (t.dataset.crm === "mas") {
      crmUi.limite += 50;
      cargarCrm();
    } else if (t.dataset.crm === "importar") {
      crmCache.importacion = await crmApi("POST", "/api/crm/importacion");
      pintarCrm();
      const sondeo = setInterval(async () => {
        crmCache.importacion = await crmApi("GET", "/api/crm/importacion");
        if (crmCache.importacion.estado !== "en_curso") {
          clearInterval(sondeo);
          cargarCrm();
        } else if (pestana === "crm") pintarCrm();
      }, 1500);
    } else if (t.dataset.negocio) abrirNegocio(t.dataset.negocio);
    else if (t.dataset.empresa) abrirEmpresa(t.dataset.empresa);
  } catch (err) {
    console.error(err);
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.matches("tr[data-empresa], article[data-negocio]")) ev.target.click();
});

document.addEventListener("input", (ev) => {
  if (ev.target.id === "crm-q") {
    crmUi.q = ev.target.value;
    crmUi.limite = 50;
    clearTimeout(crmUi.temporizador);
    crmUi.temporizador = setTimeout(cargarCrm, 250);
  } else if (ev.target.id === "crm-tipo" || ev.target.id === "crm-sin") {
    crmUi[ev.target.id === "crm-tipo" ? "tipo" : "sinActividad"] = ev.target.value;
    crmUi.limite = 50;
    cargarCrm();
  }
});

// Arrastrar negocios entre etapas.
document.addEventListener("dragstart", (ev) => {
  const t = ev.target.closest?.("article[data-negocio]");
  if (t) ev.dataTransfer.setData("text/plain", t.dataset.negocio);
});
document.addEventListener("dragover", (ev) => {
  const col = ev.target.closest?.(".crm-tablero .columna");
  if (col) {
    ev.preventDefault();
    col.classList.add("destino");
  }
});
document.addEventListener("dragleave", (ev) => ev.target.closest?.(".columna")?.classList.remove("destino"));
document.addEventListener("drop", async (ev) => {
  const col = ev.target.closest?.(".crm-tablero .columna");
  if (!col) return;
  ev.preventDefault();
  col.classList.remove("destino");
  const id = ev.dataTransfer.getData("text/plain");
  const etapa = col.dataset.etapa;
  const n = crmCache.negocios.find((x) => String(x.id) === id);
  if (!n || n.etapa === etapa) return;
  if (!ABIERTAS.includes(etapa)) {
    // Ganar o perder pide confirmación en la ficha.
    await abrirNegocio(id);
    $(`#dialogo-agente [data-cerrar-como="${etapa}"]`)?.click();
    return;
  }
  n.etapa = etapa;
  pintarCrm();
  await crmApi("PUT", `/api/crm/negocios/${id}`, { etapa });
  cargarCrm();
});

// ---------- Demostración: CRM en memoria con datos de ejemplo ----------
let demoBase = null;
function demoCrm(metodo, ruta, c) {
  if (!demoBase) {
    demoBase = structuredClone(window.DEMO.crm);
    const desplazar = (f) => (typeof f === "number" ? new Date(Date.now() - f * 60000).toISOString() : f);
    const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    for (const n of demoBase.negocios) {
      n.actualizado = desplazar(n.actualizado);
      n.cerrado = desplazar(n.cerrado);
      if (typeof n.proximo_paso_dias === "number") n.proximo_paso_fecha = dia(n.proximo_paso_dias);
    }
    for (const a of demoBase.actividades) a.fecha = desplazar(a.fecha);
    demoBase.siguiente = 1000;
  }
  const b = demoBase;
  const url = new URL(ruta, "http://demo");
  const partes = url.pathname.split("/").slice(3); // [recurso, id]
  const [recurso, id] = partes;
  const norm = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const coincide = (texto, q) => norm(q).split(/\s+/).filter(Boolean).every((p) => norm(texto).includes(p));
  const empresa = (eid) => b.empresas.find((e) => e.id === Number(eid));
  const contactoNombre = (cid) => {
    const x = b.contactos.find((k) => k.id === Number(cid));
    return x ? `${x.nombre} ${x.apellidos ?? ""}`.trim() : "";
  };
  const conNombres = (n) => ({ ...n, empresa: empresa(n.empresa_id)?.nombre ?? null, contacto: contactoNombre(n.contacto_id) });
  const ultima = (eid) => b.actividades.filter((a) => a.empresa_id === eid).map((a) => a.fecha).sort().pop() ?? null;
  const actividad = (a) => b.actividades.unshift({ id: b.siguiente++, autor: "ceo", fecha: new Date().toISOString(), ...a });
  const PROB = { nuevo: 10, contactado: 20, reunion: 40, propuesta: 60, negociacion: 80 };

  if (recurso === "resumen") {
    const abiertos = b.negocios.filter((n) => ABIERTAS.includes(n.etapa));
    const hoy = hoyIso();
    const mes = hoy.slice(0, 7);
    const ganadosMes = b.negocios.filter((n) => n.etapa === "ganado" && n.cerrado?.startsWith(mes));
    const cerrados = b.negocios.filter((n) => !ABIERTAS.includes(n.etapa));
    return {
      resumen: {
        empresas: b.empresas.length,
        contactos: b.contactos.length,
        abiertos: abiertos.length,
        valorAbierto: abiertos.reduce((s, n) => s + (n.valor ?? 0), 0),
        valorPonderado: Math.round(abiertos.reduce((s, n) => s + ((n.valor ?? 0) * PROB[n.etapa]) / 100, 0)),
        pasosVencidos: abiertos.filter((n) => n.proximo_paso_fecha && n.proximo_paso_fecha < hoy).length,
        sinProximoPaso: abiertos.filter((n) => !n.proximo_paso_fecha).length,
        ganadosMes: ganadosMes.length,
        valorGanadoMes: ganadosMes.reduce((s, n) => s + (n.valor ?? 0), 0),
        tasaCierre: cerrados.length ? Math.round((100 * cerrados.filter((n) => n.etapa === "ganado").length) / cerrados.length) : null,
      },
      negocios: b.negocios.map(conNombres).sort((x, y) => String(y.actualizado).localeCompare(String(x.actualizado))),
    };
  }
  if (recurso === "empresas" && metodo === "GET" && !id) {
    const q = url.searchParams.get("q") ?? "";
    const tipo = url.searchParams.get("tipo");
    const sin = Number(url.searchParams.get("sinActividad") || 0);
    const limite = Number(url.searchParams.get("limite") || 50);
    const limiteFecha = new Date(Date.now() - sin * 86400000).toISOString();
    const filas = b.empresas
      .filter((e) => coincide(`${e.nombre} ${e.sector} ${e.ciudad} ${e.pais}`, q) && (!tipo || e.tipo === tipo))
      .map((e) => ({
        ...e,
        contactos: b.contactos.filter((k) => k.empresa_id === e.id).length,
        negocios_abiertos: b.negocios.filter((n) => n.empresa_id === e.id && ABIERTAS.includes(n.etapa)).length,
        valor_ganado: b.negocios.filter((n) => n.empresa_id === e.id && n.etapa === "ganado").reduce((s, n) => s + (n.valor ?? 0), 0),
        ultima_actividad: ultima(e.id),
      }))
      .filter((e) => !sin || !e.ultima_actividad || e.ultima_actividad < limiteFecha)
      .sort((x, y) => String(y.ultima_actividad ?? "").localeCompare(String(x.ultima_actividad ?? "")));
    return { total: filas.length, filas: filas.slice(0, limite) };
  }
  if (recurso === "empresas" && metodo === "GET") {
    const e = empresa(id);
    return {
      empresa: e,
      contactos: b.contactos.filter((k) => k.empresa_id === e.id),
      negocios: b.negocios.filter((n) => n.empresa_id === e.id),
      actividades: b.actividades.filter((a) => a.empresa_id === e.id).sort((x, y) => y.fecha.localeCompare(x.fecha)),
    };
  }
  if (recurso === "empresas") {
    if (!c.nombre?.trim()) throw new Error("La empresa necesita un nombre.");
    if (metodo === "PUT") return Object.assign(empresa(id), c);
    const e = { id: b.siguiente++, tipo: "prospecto", ...c };
    b.empresas.push(e);
    actividad({ tipo: "nota", texto: "Empresa creada en el CRM", empresa_id: e.id });
    return e;
  }
  if (recurso === "contactos" && metodo === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const filas = b.contactos
      .map((k) => ({ ...k, empresa: empresa(k.empresa_id)?.nombre ?? "" }))
      .filter((k) => coincide(`${k.nombre} ${k.apellidos} ${k.cargo} ${k.email} ${k.empresa}`, q));
    return { total: filas.length, filas: filas.slice(0, Number(url.searchParams.get("limite") || 50)) };
  }
  if (recurso === "contactos") {
    if (!c.nombre?.trim()) throw new Error("El contacto necesita un nombre.");
    const k = { id: b.siguiente++, consentimiento: "desconocido", ...c, empresa_id: Number(c.empresa_id) };
    b.contactos.push(k);
    return k;
  }
  if (recurso === "negocios" && metodo === "GET") {
    const n = conNombres(b.negocios.find((x) => x.id === Number(id)));
    return {
      negocio: n,
      contactos: b.contactos.filter((k) => k.empresa_id === n.empresa_id),
      actividades: b.actividades.filter((a) => a.negocio_id === n.id).sort((x, y) => y.fecha.localeCompare(x.fecha)),
    };
  }
  if (recurso === "negocios") {
    const ahoraIso = new Date().toISOString();
    if (metodo === "POST") {
      if (!c.titulo?.trim()) throw new Error("El negocio necesita un título.");
      const n = { id: b.siguiente++, ...c, valor: c.valor ? Number(c.valor) : null, empresa_id: c.empresa_id ? Number(c.empresa_id) : null, actualizado: ahoraIso };
      b.negocios.push(n);
      actividad({ tipo: "nota", texto: `Negocio creado: ${n.titulo}`, negocio_id: n.id, empresa_id: n.empresa_id });
      return n;
    }
    const n = b.negocios.find((x) => x.id === Number(id));
    const antes = n.etapa;
    Object.assign(n, c, { actualizado: ahoraIso });
    if (c.valor !== undefined) n.valor = c.valor ? Number(c.valor) : null;
    if (c.contacto_id !== undefined) n.contacto_id = c.contacto_id ? Number(c.contacto_id) : null;
    if (c.etapa && c.etapa !== antes) {
      n.cerrado = ABIERTAS.includes(c.etapa) ? null : ahoraIso;
      actividad({ tipo: "nota", texto: `Etapa: ${antes} → ${c.etapa}${n.motivo_cierre && n.cerrado ? `. Motivo: ${n.motivo_cierre}` : ""}`, negocio_id: n.id, empresa_id: n.empresa_id });
    }
    return n;
  }
  if (recurso === "actividades") {
    if (!c.texto?.trim()) throw new Error("La actividad está vacía.");
    const empresaId = c.empresa_id ?? b.negocios.find((n) => n.id === c.negocio_id)?.empresa_id ?? null;
    actividad({ ...c, empresa_id: empresaId });
    return { ok: true };
  }
  throw new Error("Acción no disponible en la demostración.");
}
