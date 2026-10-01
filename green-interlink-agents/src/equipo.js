// Gestión del equipo: altas, cambios y bajas de agentes y departamentos.
// El equipo vive en config/equipo.json y se puede ampliar desde la oficina en cualquier momento.
import fs from "node:fs";

export const ESFUERZOS = ["low", "medium", "high", "xhigh"];

function slug(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export class Equipo {
  constructor(archivo) {
    this.archivo = archivo;
    this.datos = JSON.parse(fs.readFileSync(archivo, "utf8"));
  }

  get ceo() {
    return this.datos.ceo;
  }

  get departamentos() {
    return this.datos.departamentos;
  }

  // Solo los agentes en activo trabajan y aparecen en el organigrama.
  get agentes() {
    return this.datos.agentes.filter((a) => a.activo !== false);
  }

  guardar() {
    const tmp = `${this.archivo}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.datos, null, 2) + "\n");
    fs.renameSync(tmp, this.archivo);
  }

  existe(id) {
    return id === "ceo" || this.agentes.some((a) => a.id === id);
  }

  crearDepartamento(nombre) {
    const limpio = nombre?.trim();
    if (!limpio) throw new Error("Escribe el nombre del departamento.");
    const existente = this.departamentos.find((d) => slug(d.nombre) === slug(limpio));
    if (existente) return existente;
    let id = slug(limpio) || "depto";
    while (this.departamentos.some((d) => d.id === id)) id += "-2";
    const sala = `S-${String(this.departamentos.length + 1).padStart(2, "0")}`;
    const depto = { id, nombre: limpio, sala };
    this.departamentos.push(depto);
    this.guardar();
    return depto;
  }

  siguienteExtension(departamentoId) {
    const indice = this.departamentos.findIndex((d) => d.id === departamentoId) + 1;
    const usadas = new Set(this.datos.agentes.map((a) => a.extension));
    for (let n = indice * 100 + 1; n < indice * 100 + 100; n++) {
      if (!usadas.has(String(n))) return String(n);
    }
    return String(900 + this.datos.agentes.length);
  }

  // Valida y normaliza la ficha de un agente nuevo o editado.
  ficha(entrada, actual = {}) {
    const f = { ...actual };
    for (const campo of ["nombre", "cargo", "personalidad"]) {
      if (entrada[campo] !== undefined) f[campo] = String(entrada[campo]).trim();
    }
    if (entrada.departamento !== undefined) f.departamento = entrada.departamento;
    if (entrada.reportaA !== undefined) f.reportaA = entrada.reportaA;
    if (entrada.esfuerzo !== undefined) f.esfuerzo = entrada.esfuerzo;
    if (entrada.avatar && typeof entrada.avatar === "object") f.avatar = entrada.avatar;
    if (entrada.responsabilidades !== undefined) {
      const lista = Array.isArray(entrada.responsabilidades)
        ? entrada.responsabilidades
        : String(entrada.responsabilidades).split("\n");
      f.responsabilidades = lista.map((r) => String(r).trim()).filter(Boolean);
    }

    if (!f.nombre) throw new Error("Escribe el nombre del agente.");
    if (!f.cargo) throw new Error("Escribe el cargo del agente.");
    if (!this.departamentos.some((d) => d.id === f.departamento)) throw new Error("Elige un departamento.");
    if (!this.existe(f.reportaA)) throw new Error("Elige a quién reporta.");
    if (f.reportaA === f.id) throw new Error("Un agente no puede reportarse a sí mismo.");
    if (!ESFUERZOS.includes(f.esfuerzo ?? "medium")) throw new Error("Nivel de esfuerzo no válido.");
    if (!f.responsabilidades?.length) throw new Error("Añade al menos una responsabilidad.");
    f.esfuerzo ??= "medium";
    f.personalidad ||= "Profesional, claro y orientado a resultados.";
    return f;
  }

  crearAgente(entrada) {
    const f = this.ficha(entrada);
    let id = slug(f.nombre.split(" ")[0]) || "agente";
    const base = id;
    for (let n = 2; this.datos.agentes.some((a) => a.id === id) || id === "ceo"; n++) id = `${base}${n}`;
    const agente = { id, ...f, extension: this.siguienteExtension(f.departamento), activo: true };
    this.datos.agentes.push(agente);
    this.guardar();
    return agente;
  }

  editarAgente(id, entrada) {
    const actual = this.datos.agentes.find((a) => a.id === id);
    if (!actual) throw new Error("No existe ese agente.");
    const f = this.ficha(entrada, actual);
    Object.assign(actual, f);
    this.guardar();
    return actual;
  }

  // La baja conserva el historial: el agente deja de trabajar y su equipo pasa a su responsable.
  darDeBaja(id) {
    const agente = this.datos.agentes.find((a) => a.id === id && a.activo !== false);
    if (!agente) throw new Error("No existe ese agente.");
    for (const a of this.agentes) if (a.reportaA === id) a.reportaA = agente.reportaA;
    agente.activo = false;
    this.guardar();
    return agente;
  }

  toJSON() {
    return { ceo: this.ceo, departamentos: this.departamentos, agentes: this.agentes };
  }
}
