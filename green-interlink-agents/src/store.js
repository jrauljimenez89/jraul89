// Estado compartido de la oficina, guardado en data/estado.json.
// Todos los cambios pasan por aquí para que la interfaz reciba un aviso en tiempo real.
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";

const ESTADO_VACIO = {
  siguienteId: 1,
  pausado: false,
  tareas: [],
  mensajes: [],
  aprobaciones: [],
  borradores: [],
  actividad: [],
  agentes: {},
  consumo: { fecha: "", turnos: 0, tokensEntrada: 0, tokensSalida: 0 },
};

const MAX_ACTIVIDAD = 300;
const NOMBRE_CANAL = {
  linkedin_mensaje: "mensaje de LinkedIn",
  linkedin_publicacion: "publicación de LinkedIn",
  instagram: "publicación de Instagram",
  email: "email",
  blog: "artículo de blog",
  otro: "texto",
};

export const ESTADOS_TAREA = ["pendiente", "en_curso", "esperando_aprobacion", "bloqueada", "hecha"];

export class Store extends EventEmitter {
  constructor(archivo) {
    super();
    this.archivo = archivo;
    this.estado = structuredClone(ESTADO_VACIO);
    if (fs.existsSync(archivo)) {
      this.estado = { ...this.estado, ...JSON.parse(fs.readFileSync(archivo, "utf8")) };
    }
    this.guardadoPendiente = null;
  }

  ahora() {
    return new Date().toISOString();
  }

  nuevoId(prefijo) {
    return `${prefijo}-${this.estado.siguienteId++}`;
  }

  cambio() {
    clearTimeout(this.guardadoPendiente);
    this.guardadoPendiente = setTimeout(() => this.guardar(), 200);
    this.emit("cambio");
  }

  guardar() {
    fs.mkdirSync(path.dirname(this.archivo), { recursive: true });
    const tmp = `${this.archivo}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.estado, null, 2));
    fs.renameSync(tmp, this.archivo);
  }

  registrar(agente, texto) {
    this.estado.actividad.unshift({ fecha: this.ahora(), agente, texto });
    this.estado.actividad.length = Math.min(this.estado.actividad.length, MAX_ACTIVIDAD);
    this.cambio();
  }

  estadoAgente(id, estado, foco = "") {
    this.estado.agentes[id] = { estado, foco, desde: this.ahora() };
    this.cambio();
  }

  // ---- Tareas ----
  crearTarea({ titulo, descripcion = "", asignadoA, creadaPor }) {
    const tarea = {
      id: this.nuevoId("T"),
      titulo,
      descripcion,
      asignadoA,
      creadaPor,
      estado: "pendiente",
      resultado: "",
      creada: this.ahora(),
      actualizada: this.ahora(),
    };
    this.estado.tareas.unshift(tarea);
    this.registrar(creadaPor, `asignó la tarea ${tarea.id} «${titulo}» a ${asignadoA}`);
    return tarea;
  }

  actualizarTarea(id, cambios) {
    const tarea = this.estado.tareas.find((t) => t.id === id);
    if (!tarea) return null;
    Object.assign(tarea, cambios, { actualizada: this.ahora() });
    this.cambio();
    return tarea;
  }

  // ---- Mensajes internos ----
  enviarMensaje({ de, para, texto }) {
    const mensaje = { id: this.nuevoId("M"), de, para, texto, fecha: this.ahora(), leido: false };
    this.estado.mensajes.unshift(mensaje);
    this.cambio();
    return mensaje;
  }

  bandeja(id) {
    return this.estado.mensajes.filter((m) => m.para === id && !m.leido).reverse();
  }

  marcarLeidos(ids) {
    for (const m of this.estado.mensajes) if (ids.includes(m.id)) m.leido = true;
    this.cambio();
  }

  // ---- Aprobaciones del CEO ----
  solicitarAprobacion({ solicitante, titulo, detalle, tareaId = null, tipo = "general", propuesta = null }) {
    const ap = {
      id: this.nuevoId("A"),
      tipo,
      propuesta,
      solicitante,
      titulo,
      detalle,
      tareaId,
      estado: "pendiente",
      comentario: "",
      fecha: this.ahora(),
    };
    this.estado.aprobaciones.unshift(ap);
    this.registrar(solicitante, `pidió aprobación: «${titulo}»`);
    return ap;
  }

  resolverAprobacion(id, decision, comentario = "") {
    const ap = this.estado.aprobaciones.find((a) => a.id === id);
    if (!ap || ap.estado !== "pendiente") return null;
    ap.estado = decision;
    ap.comentario = comentario;
    ap.resuelta = this.ahora();
    this.cambio();
    return ap;
  }

  // ---- Borradores para enviar desde las cuentas del CEO ----
  guardarBorrador({ autor, canal, destinatario = "", asunto = "", contenido }) {
    const b = {
      id: this.nuevoId("B"),
      autor,
      canal,
      destinatario,
      asunto,
      contenido,
      estado: "borrador",
      fecha: this.ahora(),
    };
    this.estado.borradores.unshift(b);
    this.registrar(autor, `preparó un borrador de ${NOMBRE_CANAL[canal] ?? canal}${destinatario ? ` para ${destinatario}` : ""}`);
    return b;
  }

  actualizarBorrador(id, estado) {
    const b = this.estado.borradores.find((x) => x.id === id);
    if (!b) return null;
    b.estado = estado;
    this.cambio();
    return b;
  }

  // ---- Control de consumo ----
  sumarConsumo(usage) {
    const hoy = this.ahora().slice(0, 10);
    if (this.estado.consumo.fecha !== hoy) {
      this.estado.consumo = { fecha: hoy, turnos: 0, tokensEntrada: 0, tokensSalida: 0 };
    }
    if (usage) {
      this.estado.consumo.tokensEntrada += usage.input_tokens ?? 0;
      this.estado.consumo.tokensSalida += usage.output_tokens ?? 0;
    }
    this.cambio();
  }

  sumarTurno() {
    this.sumarConsumo(null);
    this.estado.consumo.turnos += 1;
  }

  turnosHoy() {
    return this.estado.consumo.fecha === this.ahora().slice(0, 10) ? this.estado.consumo.turnos : 0;
  }
}
