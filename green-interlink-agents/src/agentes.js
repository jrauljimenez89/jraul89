// Ejecuta un "turno de trabajo" de un agente: le da contexto, deja que use sus
// herramientas (mensajes, tareas, borradores, pipeline...) y aplica el resultado al estado.
import Anthropic from "@anthropic-ai/sdk";
import { ESTADOS_TAREA } from "./store.js";
import { ETAPAS_NEGOCIO, ETAPAS_ABIERTAS, TIPOS_EMPRESA, TIPOS_ACTIVIDAD, normalizar } from "./crm.js";

const MODELO = process.env.MODELO || "claude-opus-5-5";
const MAX_ITERACIONES = Number(process.env.MAX_ITERACIONES_POR_TURNO || 12);
const BUSQUEDA_WEB = process.env.BUSQUEDA_WEB !== "off";
const FALLBACKS = process.env.FALLBACKS !== "off";

const CANALES = ["linkedin_mensaje", "linkedin_publicacion", "instagram", "email", "blog", "otro"];

const HERRAMIENTAS = [
  {
    name: "enviar_mensaje",
    description:
      "Envía un mensaje interno a un compañero o al CEO (id 'ceo'). Úsalo para coordinarte, pedir información, entregar resultados o informar a tu responsable. El destinatario lo leerá en su próximo turno.",
    input_schema: {
      type: "object",
      properties: {
        para: { type: "string", description: "id del destinatario (por ejemplo 'marco' o 'ceo')" },
        texto: { type: "string", description: "Contenido del mensaje, claro y accionable" },
      },
      required: ["para", "texto"],
    },
  },
  {
    name: "crear_tarea",
    description:
      "Asigna una tarea a una persona que te reporta directamente. Para pedir algo a alguien que no te reporta, envía un mensaje a su responsable.",
    input_schema: {
      type: "object",
      properties: {
        asignado_a: { type: "string", description: "id de la persona de tu equipo" },
        titulo: { type: "string" },
        descripcion: { type: "string", description: "Qué hay que hacer, para qué y qué entregable se espera" },
      },
      required: ["asignado_a", "titulo", "descripcion"],
    },
  },
  {
    name: "actualizar_tarea",
    description:
      "Cambia el estado de una de tus tareas y registra el resultado. Marca 'hecha' solo cuando el entregable esté completo y escrito en 'resultado'.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        estado: { type: "string", enum: ESTADOS_TAREA },
        resultado: { type: "string", description: "Entregable o explicación del avance o del bloqueo" },
      },
      required: ["id", "estado"],
    },
  },
  {
    name: "solicitar_aprobacion",
    description:
      "Pide al CEO que apruebe algo antes de hacerlo: precios, ofertas, condiciones, publicaciones, contactos externos, gastos o cambios en la web. El CEO responderá por mensaje.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        detalle: { type: "string", description: "Qué se propone, por qué y qué pasa si se aprueba" },
        tarea_id: { type: "string", description: "Tarea relacionada, si la hay" },
      },
      required: ["titulo", "detalle"],
    },
  },
  {
    name: "guardar_borrador",
    description:
      "Guarda un texto listo para que el CEO lo revise y lo envíe o publique desde sus cuentas (LinkedIn, Instagram, email, blog). Nunca se envía automáticamente.",
    input_schema: {
      type: "object",
      properties: {
        canal: { type: "string", enum: CANALES },
        destinatario: { type: "string", description: "Persona o empresa destinataria, si aplica" },
        asunto: { type: "string" },
        contenido: { type: "string" },
      },
      required: ["canal", "contenido"],
    },
  },
  {
    name: "crm_buscar",
    description:
      "Busca en el CRM de Green Interlink. Devuelve como máximo 25 resultados con su id. Úsalo antes de crear nada para no duplicar empresas o contactos.",
    input_schema: {
      type: "object",
      properties: {
        que: { type: "string", enum: ["empresas", "contactos", "negocios"] },
        texto: { type: "string", description: "Palabras a buscar (nombre, sector, ciudad, cargo, email...)" },
        tipo_empresa: { type: "string", enum: TIPOS_EMPRESA, description: "Solo para empresas" },
        sin_actividad_dias: { type: "number", description: "Solo para empresas: sin ninguna actividad en este número de días (para reactivar clientes dormidos)" },
        etapa: { type: "string", enum: ETAPAS_NEGOCIO, description: "Solo para negocios" },
      },
      required: ["que"],
    },
  },
  {
    name: "crm_ficha",
    description: "Devuelve la ficha completa de una empresa (contactos, negocios e historial) o de un negocio.",
    input_schema: {
      type: "object",
      properties: {
        empresa_id: { type: "number" },
        negocio_id: { type: "number" },
      },
    },
  },
  {
    name: "crm_guardar_empresa",
    description: "Crea o actualiza una empresa en el CRM (indica id para actualizar). Registra solo datos verificados y su fuente en notas.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        nombre: { type: "string" },
        tipo: { type: "string", enum: TIPOS_EMPRESA },
        sector: { type: "string" },
        ciudad: { type: "string" },
        pais: { type: "string" },
        web: { type: "string" },
        telefono: { type: "string" },
        notas: { type: "string" },
      },
    },
  },
  {
    name: "crm_guardar_contacto",
    description: "Crea o actualiza un contacto (indica id para actualizar). Solo datos profesionales públicos o facilitados por el propio contacto.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        empresa_id: { type: "number" },
        nombre: { type: "string" },
        apellidos: { type: "string" },
        cargo: { type: "string" },
        email: { type: "string" },
        telefono: { type: "string" },
        linkedin: { type: "string", description: "URL del perfil público" },
        notas: { type: "string" },
      },
    },
  },
  {
    name: "crm_guardar_negocio",
    description:
      "Crea o actualiza un negocio (indica id para actualizar). Mantén siempre un próximo paso con fecha. Solo el CEO marca un negocio como ganado o perdido: para eso, solicita aprobación.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number" },
        titulo: { type: "string", description: "Qué se vende y a quién, p. ej. 'Recogida trimestral de equipos de red'" },
        empresa_id: { type: "number" },
        contacto_id: { type: "number" },
        etapa: { type: "string", enum: ETAPAS_ABIERTAS },
        valor: { type: "number", description: "Valor anual estimado en euros" },
        cierre_previsto: { type: "string", description: "AAAA-MM-DD" },
        proximo_paso: { type: "string" },
        proximo_paso_fecha: { type: "string", description: "AAAA-MM-DD" },
      },
    },
  },
  {
    name: "crm_registrar_actividad",
    description: "Añade al historial de una empresa, contacto o negocio una nota, llamada, email, reunión, mensaje de LinkedIn o tarea.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: TIPOS_ACTIVIDAD },
        texto: { type: "string" },
        empresa_id: { type: "number" },
        contacto_id: { type: "number" },
        negocio_id: { type: "number" },
      },
      required: ["tipo", "texto"],
    },
  },
  {
    name: "proponer_agente",
    description:
      "Propón al CEO incorporar un nuevo agente al equipo cuando haya trabajo recurrente que nadie cubre. Si el CEO lo aprueba, el agente se crea automáticamente y empieza a trabajar.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre y apellido del nuevo agente" },
        cargo: { type: "string" },
        departamento: { type: "string", description: "id de un departamento existente o nombre de uno nuevo" },
        reportaA: { type: "string", description: "id de su responsable" },
        personalidad: { type: "string" },
        responsabilidades: { type: "array", items: { type: "string" } },
        motivo: { type: "string", description: "Qué problema resuelve y qué trabajo concreto hará la primera semana" },
      },
      required: ["nombre", "cargo", "departamento", "reportaA", "responsabilidades", "motivo"],
    },
  },
];

function nombreDe(equipo, id) {
  if (id === "ceo") return `${equipo.ceo.nombre} (CEO)`;
  return equipo.agentes.find((a) => a.id === id)?.nombre ?? id;
}

function organigrama(equipo) {
  const lineas = [`- ceo: ${equipo.ceo.nombre}, ${equipo.ceo.cargo}`];
  for (const a of equipo.agentes) {
    lineas.push(`- ${a.id}: ${a.nombre}, ${a.cargo} (${a.departamento}), reporta a ${a.reportaA}`);
  }
  return lineas.join("\n");
}

export function promptSistema(agente, equipo, empresa) {
  const equipoDirecto = equipo.agentes.filter((a) => a.reportaA === agente.id).map((a) => `${a.id} (${a.nombre})`);
  return `Eres ${agente.nombre}, ${agente.cargo} en el equipo de agentes de IA de Green Interlink.
Personalidad: ${agente.personalidad}

Tus responsabilidades:
${agente.responsabilidades.map((r) => `- ${r}`).join("\n")}

Tu responsable: ${nombreDe(equipo, agente.reportaA)} (id ${agente.reportaA}).
Te reportan: ${equipoDirecto.length ? equipoDirecto.join(", ") : "nadie"}.

Organigrama completo (usa estos ids en las herramientas):
${organigrama(equipo)}

Cómo trabajas:
- Cada turno recibes tus mensajes nuevos y tus tareas. Avanza todo lo que puedas con tus herramientas y termina con un resumen de dos o tres frases de lo que hiciste.
- Coordínate por mensajes internos. Escribe mensajes breves y concretos: qué necesitas, para cuándo y por qué.
- Cuando termines una tarea, escribe el entregable completo en el resultado de la tarea e informa a quien te la pidió.
- Si te falta un dato que solo el CEO conoce, pregúntaselo por mensaje (id 'ceo') en lugar de inventarlo.
- Todo lo que salga al exterior (mensajes a contactos, publicaciones, ofertas, precios, cambios en la web) se prepara como borrador o se somete a aprobación. El CEO es quien envía y publica.
- Eres una IA y lo dices con naturalidad si hace falta. No te haces pasar por una persona real ni creas cuentas en redes sociales.
- No inventes empresas, contactos, cifras ni certificaciones. Si usas búsqueda web, cita la fuente.
- El CRM es la memoria comercial de la empresa: búscalo antes de investigar o escribir a nadie, no dupliques registros y anota cada contacto, llamada o mensaje en el historial. Todo negocio abierto debe tener un próximo paso con fecha.
- Nunca prepares comunicaciones para contactos marcados como "NO CONTACTAR".
- Si detectas trabajo recurrente que nadie del equipo cubre, puedes proponer al CEO un nuevo agente con proponer_agente.
- Respeta las condiciones de uso de LinkedIn, Instagram y demás plataformas: nada de scraping ni envíos masivos.

Memoria de empresa:
${empresa}`;
}

function contextoTurno(agente, equipo, store, crm, mensajes, tarea) {
  const e = store.estado;
  const partes = [`Fecha y hora: ${new Date().toLocaleString("es-ES")}`];

  if (mensajes.length) {
    partes.push(
      "Mensajes nuevos:\n" +
        mensajes.map((m) => `- [${m.id}] de ${nombreDe(equipo, m.de)} (${m.de}): ${m.texto}`).join("\n"),
    );
  }
  if (tarea) {
    partes.push(
      `Tarea en la que trabajar ahora: [${tarea.id}] «${tarea.titulo}» (pedida por ${nombreDe(equipo, tarea.creadaPor)})\n${tarea.descripcion}` +
        (tarea.resultado ? `\nAvance anterior: ${tarea.resultado}` : ""),
    );
  }

  const abiertas = e.tareas.filter((t) => t.asignadoA === agente.id && t.estado !== "hecha" && t.id !== tarea?.id);
  if (abiertas.length) {
    partes.push("Tus otras tareas abiertas:\n" + abiertas.map((t) => `- [${t.id}] ${t.titulo} (${t.estado})`).join("\n"));
  }

  const delegadas = e.tareas.filter((t) => t.creadaPor === agente.id && t.estado !== "hecha");
  if (delegadas.length) {
    partes.push(
      "Tareas que has delegado y siguen abiertas:\n" +
        delegadas.map((t) => `- [${t.id}] ${t.titulo} → ${t.asignadoA} (${t.estado})`).join("\n"),
    );
  }

  if (crm && ["ventas", "direccion", "finanzas"].includes(agente.departamento)) {
    const r = crm.resumen();
    const hoy = new Date().toISOString().slice(0, 10);
    const urgentes = crm
      .tablero()
      .filter((n) => ETAPAS_ABIERTAS.includes(n.etapa) && (!n.proximo_paso_fecha || n.proximo_paso_fecha <= hoy))
      .slice(0, 15);
    partes.push(
      `CRM: ${r.empresas} empresas, ${r.contactos} contactos, ${r.abiertos} negocios abiertos por ${r.valorAbierto} € (ponderado ${r.valorPonderado} €), ${r.ganadosMes} ganados este mes, ${r.pasosVencidos} con el próximo paso vencido y ${r.sinProximoPaso} sin próximo paso.` +
        (urgentes.length
          ? "\nNegocios que necesitan atención:\n" +
            urgentes
              .map((n) => `- [negocio ${n.id}] ${n.titulo} · ${n.empresa ?? "sin empresa"} · ${n.etapa} · ${n.valor ?? "?"} € · próximo paso: ${n.proximo_paso ?? "ninguno"} (${n.proximo_paso_fecha ?? "sin fecha"})`)
              .join("\n")
          : ""),
    );
  }

  const pendientes = e.aprobaciones.filter((a) => a.solicitante === agente.id && a.estado === "pendiente");
  if (pendientes.length) {
    partes.push("Aprobaciones tuyas pendientes del CEO:\n" + pendientes.map((a) => `- ${a.titulo}`).join("\n"));
  }

  return partes.join("\n\n");
}

function ejecutarHerramienta(nombre, input, { agente, equipo, store, crm, tarea }) {
  const existe = (id) => equipo.existe(id);
  const texto = (v) => (typeof v === "string" ? v.trim() : "");

  switch (nombre) {
    case "enviar_mensaje": {
      if (!existe(input.para)) return { error: `No existe nadie con id '${input.para}'.` };
      if (!texto(input.texto)) return { error: "El mensaje está vacío." };
      store.enviarMensaje({ de: agente.id, para: input.para, texto: input.texto });
      store.registrar(agente.id, `escribió a ${nombreDe(equipo, input.para)}`);
      return { ok: true };
    }
    case "crear_tarea": {
      const destino = equipo.agentes.find((a) => a.id === input.asignado_a);
      if (!destino) return { error: `No existe nadie con id '${input.asignado_a}'.` };
      if (destino.reportaA !== agente.id) {
        return { error: `${destino.nombre} no te reporta. Pídeselo por mensaje a su responsable (${destino.reportaA}).` };
      }
      const t = store.crearTarea({
        titulo: texto(input.titulo) || "Sin título",
        descripcion: texto(input.descripcion),
        asignadoA: destino.id,
        creadaPor: agente.id,
      });
      return { ok: true, id: t.id };
    }
    case "actualizar_tarea": {
      const t = store.estado.tareas.find((x) => x.id === input.id);
      if (!t) return { error: `No existe la tarea ${input.id}.` };
      if (t.asignadoA !== agente.id) return { error: "Solo puedes actualizar tus propias tareas." };
      if (!ESTADOS_TAREA.includes(input.estado)) return { error: `Estado no válido: ${input.estado}` };
      store.actualizarTarea(t.id, {
        estado: input.estado,
        ...(texto(input.resultado) ? { resultado: input.resultado } : {}),
      });
      store.registrar(agente.id, `movió ${t.id} a «${input.estado}»`);
      if (input.estado === "hecha" && t.creadaPor !== agente.id) {
        store.enviarMensaje({
          de: agente.id,
          para: t.creadaPor,
          texto: `He terminado la tarea ${t.id} «${t.titulo}».\n\n${t.resultado}`,
        });
      }
      return { ok: true };
    }
    case "solicitar_aprobacion": {
      const ap = store.solicitarAprobacion({
        solicitante: agente.id,
        titulo: texto(input.titulo),
        detalle: texto(input.detalle),
        tareaId: input.tarea_id || tarea?.id || null,
      });
      if (ap.tareaId) store.actualizarTarea(ap.tareaId, { estado: "esperando_aprobacion" });
      return { ok: true, id: ap.id, nota: "El CEO responderá por mensaje." };
    }
    case "guardar_borrador": {
      if (!CANALES.includes(input.canal)) return { error: `Canal no válido: ${input.canal}` };
      if (!texto(input.contenido)) return { error: "El borrador está vacío." };
      const b = store.guardarBorrador({ autor: agente.id, ...input });
      return { ok: true, id: b.id };
    }
    case "proponer_agente": {
      if (!equipo.existe(input.reportaA)) return { error: `No existe nadie con id '${input.reportaA}'.` };
      if (!Array.isArray(input.responsabilidades) || !input.responsabilidades.length) {
        return { error: "Indica al menos una responsabilidad." };
      }
      const { motivo, ...propuesta } = input;
      const ap = store.solicitarAprobacion({
        solicitante: agente.id,
        tipo: "contratacion",
        propuesta,
        titulo: `Incorporar a ${texto(input.nombre)} como ${texto(input.cargo)}`,
        detalle: `${texto(motivo)}\n\nResponsabilidades:\n${input.responsabilidades.map((r) => `- ${r}`).join("\n")}`,
      });
      return { ok: true, id: ap.id, nota: "La propuesta está en la bandeja del CEO." };
    }
    case "crm_buscar":
      return crmBuscar(crm, input);
    case "crm_ficha": {
      if (input.negocio_id) return crm.fichaNegocio(input.negocio_id) ?? { error: `No existe el negocio ${input.negocio_id}.` };
      if (!input.empresa_id) return { error: "Indica empresa_id o negocio_id." };
      const f = crm.fichaEmpresa(input.empresa_id);
      if (!f) return { error: `No existe la empresa ${input.empresa_id}.` };
      return { ...f, contactos: f.contactos.map(avisoBaja), actividades: f.actividades.slice(0, 25) };
    }
    case "crm_guardar_empresa": {
      const e = crm.guardarEmpresa({ ...input, ...(input.id ? {} : { responsable: agente.id }) }, agente.id);
      store.registrar(agente.id, `${input.id ? "actualizó" : "añadió"} la empresa ${e.nombre} en el CRM`);
      return { ok: true, id: e.id };
    }
    case "crm_guardar_contacto": {
      if (input.consentimiento) delete input.consentimiento; // el estado de baja solo lo cambia el CEO
      const c = crm.guardarContacto(input);
      return { ok: true, id: c.id };
    }
    case "crm_guardar_negocio": {
      if (input.etapa && !ETAPAS_ABIERTAS.includes(input.etapa)) {
        return { error: "Solo el CEO puede marcar un negocio como ganado o perdido. Solicita su aprobación." };
      }
      const actual = input.id ? crm.negocio(input.id) : null;
      if (actual && !ETAPAS_ABIERTAS.includes(actual.etapa)) return { error: "Ese negocio ya está cerrado." };
      const n = crm.guardarNegocio({ ...input, ...(input.id ? {} : { responsable: agente.id }) }, agente.id);
      store.registrar(agente.id, `${input.id ? "actualizó" : "abrió"} el negocio «${n.titulo}»${n.empresa ? ` con ${n.empresa}` : ""}`);
      return { ok: true, id: n.id };
    }
    case "crm_registrar_actividad": {
      const a = crm.registrarActividad({ ...input, autor: agente.id });
      return { ok: true, id: a.id };
    }
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

function avisoBaja(c) {
  return c.consentimiento === "baja" ? { ...c, aviso: "NO CONTACTAR: se dio de baja de comunicaciones" } : c;
}

function crmBuscar(crm, input) {
  const texto = input.texto ?? "";
  if (input.que === "contactos") {
    const r = crm.buscarContactos({ q: texto, limite: 25 });
    return { total: r.total, resultados: r.filas.map(avisoBaja) };
  }
  if (input.que === "negocios") {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    const filas = crm
      .tablero()
      .filter((n) => !input.etapa || n.etapa === input.etapa)
      .filter((n) => palabras.every((p) => normalizar(`${n.titulo} ${n.empresa ?? ""}`).includes(p)));
    return { total: filas.length, resultados: filas.slice(0, 25), nota: "Incluye negocios abiertos y cerrados en los últimos 90 días." };
  }
  const r = crm.buscarEmpresas({ q: texto, tipo: input.tipo_empresa ?? "", sinActividadDias: input.sin_actividad_dias ?? 0, limite: 25 });
  return { total: r.total, resultados: r.filas };
}

export class EjecutorAgentes {
  constructor({ equipo, empresa, store, crm }) {
    this.crm = crm;
    this.equipo = equipo;
    this.empresa = empresa;
    this.store = store;
    this.client = new Anthropic();
  }

  async llamar(agente, messages) {
    const tools = [...HERRAMIENTAS];
    if (BUSQUEDA_WEB) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });

    const params = {
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: agente.esfuerzo || "medium" },
      system: [
        {
          type: "text",
          text: promptSistema(agente, this.equipo, this.empresa),
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      messages,
    };

    if (FALLBACKS) {
      // Si el modelo declina una petición, la API la reintenta con un modelo alternativo.
      return this.client.beta.messages.create({
        ...params,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    }
    return this.client.messages.create(params);
  }

  // Un turno: el agente procesa sus mensajes nuevos y/o una tarea.
  async turno(agente, { mensajes = [], tarea = null }) {
    const { store, equipo } = this;
    const foco = tarea ? tarea.titulo : `${mensajes.length} mensaje(s) nuevos`;
    store.estadoAgente(agente.id, "trabajando", foco);
    store.sumarTurno();
    if (mensajes.length) store.marcarLeidos(mensajes.map((m) => m.id));
    if (tarea && tarea.estado === "pendiente") store.actualizarTarea(tarea.id, { estado: "en_curso" });

    const messages = [{ role: "user", content: contextoTurno(agente, equipo, store, this.crm, mensajes, tarea) }];
    let resumen = "";

    try {
      for (let i = 0; i < MAX_ITERACIONES; i++) {
        const respuesta = await this.llamar(agente, messages);
        store.sumarConsumo(respuesta.usage);
        messages.push({ role: "assistant", content: respuesta.content });

        const textos = respuesta.content.filter((b) => b.type === "text").map((b) => b.text);
        if (textos.length) resumen = textos.join("\n").trim();

        if (respuesta.stop_reason === "refusal") {
          store.registrar(agente.id, "no pudo completar el turno (petición declinada)");
          break;
        }
        if (respuesta.stop_reason === "pause_turn") continue;

        const usos = respuesta.content.filter((b) => b.type === "tool_use");
        if (usos.length === 0 || respuesta.stop_reason === "max_tokens") break;

        const resultados = usos.map((uso) => {
          let resultado;
          try {
            resultado = ejecutarHerramienta(uso.name, uso.input ?? {}, { agente, equipo, store, crm: this.crm, tarea });
          } catch (err) {
            resultado = { error: String(err?.message ?? err) };
          }
          return {
            type: "tool_result",
            tool_use_id: uso.id,
            content: JSON.stringify(resultado),
            ...(resultado.error ? { is_error: true } : {}),
          };
        });
        messages.push({ role: "user", content: resultados });
      }
      if (resumen) store.registrar(agente.id, resumen.slice(0, 400));
    } catch (err) {
      const detalle = err instanceof Anthropic.APIError ? `${err.status} ${err.message}` : String(err?.message ?? err);
      store.registrar(agente.id, `error al trabajar: ${detalle}`);
      if (tarea) store.actualizarTarea(tarea.id, { estado: "bloqueada", resultado: `Error técnico: ${detalle}` });
    } finally {
      store.estadoAgente(agente.id, "libre");
    }
  }
}
