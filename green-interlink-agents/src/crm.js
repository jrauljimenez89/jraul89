// CRM propio de Green Interlink: empresas, contactos, negocios y actividades.
// Se guarda en data/crm.db (SQLite incluido en Node) para manejar muchos miles de registros.
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";

export const ETAPAS_NEGOCIO = ["nuevo", "contactado", "reunion", "propuesta", "negociacion", "ganado", "perdido"];
export const ETAPAS_ABIERTAS = ETAPAS_NEGOCIO.slice(0, 5);
export const PROBABILIDAD = { nuevo: 10, contactado: 20, reunion: 40, propuesta: 60, negociacion: 80, ganado: 100, perdido: 0 };
export const TIPOS_EMPRESA = ["cliente", "prospecto", "socio", "proveedor", "otro"];
export const TIPOS_ACTIVIDAD = ["nota", "llamada", "email", "reunion", "linkedin", "tarea"];
export const CONSENTIMIENTOS = ["si", "desconocido", "baja"];

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, dominio TEXT, sector TEXT, tipo TEXT DEFAULT 'prospecto',
  ciudad TEXT, pais TEXT, telefono TEXT, web TEXT, notas TEXT, responsable TEXT,
  hubspot_id TEXT UNIQUE, busqueda TEXT, creada TEXT, actualizada TEXT
);
CREATE TABLE IF NOT EXISTS contactos (
  id INTEGER PRIMARY KEY, empresa_id INTEGER REFERENCES empresas(id), nombre TEXT NOT NULL, apellidos TEXT,
  cargo TEXT, email TEXT, telefono TEXT, linkedin TEXT, consentimiento TEXT DEFAULT 'desconocido', notas TEXT,
  hubspot_id TEXT UNIQUE, busqueda TEXT, creado TEXT, actualizado TEXT
);
CREATE TABLE IF NOT EXISTS negocios (
  id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, empresa_id INTEGER REFERENCES empresas(id),
  contacto_id INTEGER REFERENCES contactos(id), etapa TEXT NOT NULL DEFAULT 'nuevo', valor REAL,
  cierre_previsto TEXT, proximo_paso TEXT, proximo_paso_fecha TEXT, responsable TEXT, motivo_cierre TEXT,
  hubspot_id TEXT UNIQUE, hubspot_etapa TEXT, creado TEXT, actualizado TEXT, cerrado TEXT
);
CREATE TABLE IF NOT EXISTS actividades (
  id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, texto TEXT NOT NULL, empresa_id INTEGER, contacto_id INTEGER,
  negocio_id INTEGER, autor TEXT, fecha TEXT, hubspot_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS i_contactos_empresa ON contactos(empresa_id);
CREATE INDEX IF NOT EXISTS i_negocios_empresa ON negocios(empresa_id);
CREATE INDEX IF NOT EXISTS i_negocios_etapa ON negocios(etapa);
CREATE INDEX IF NOT EXISTS i_actividades_empresa ON actividades(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS i_actividades_negocio ON actividades(negocio_id, fecha);
`;

export const normalizar = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const ahora = () => new Date().toISOString();
const vacioANull = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : v);

export class Crm extends EventEmitter {
  constructor(archivo) {
    super();
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    this.db = new DatabaseSync(archivo);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(ESQUEMA);
  }

  // Durante una importación masiva se silencian los avisos y se emite uno al final.
  cambio() {
    if (!this.silencioso) this.emit("cambio");
  }

  uno(sql, ...p) {
    return this.db.prepare(sql).get(...p) ?? null;
  }

  todos(sql, ...p) {
    return this.db.prepare(sql).all(...p);
  }

  // ---- Empresas ----
  guardarEmpresa(datos, autor = "ceo") {
    const campos = ["nombre", "dominio", "sector", "tipo", "ciudad", "pais", "telefono", "web", "notas", "responsable", "hubspot_id"];
    const actual = datos.id ? this.uno("SELECT * FROM empresas WHERE id = ?", Number(datos.id)) : null;
    if (datos.id && !actual) throw new Error(`No existe la empresa ${datos.id}.`);
    const fila = { ...(actual ?? { tipo: "prospecto" }) };
    for (const c of campos) if (datos[c] !== undefined) fila[c] = vacioANull(datos[c]);
    if (!fila.nombre) throw new Error("La empresa necesita un nombre.");
    if (fila.tipo && !TIPOS_EMPRESA.includes(fila.tipo)) throw new Error(`Tipo de empresa no válido: ${fila.tipo}`);
    fila.busqueda = normalizar([fila.nombre, fila.dominio, fila.sector, fila.ciudad, fila.pais].filter(Boolean).join(" "));
    fila.actualizada = ahora();

    if (actual) {
      this.db
        .prepare(
          `UPDATE empresas SET ${campos.map((c) => `${c} = ?`).join(", ")}, busqueda = ?, actualizada = ? WHERE id = ?`,
        )
        .run(...campos.map((c) => fila[c] ?? null), fila.busqueda, fila.actualizada, actual.id);
    } else {
      fila.creada = fila.actualizada;
      const r = this.db
        .prepare(`INSERT INTO empresas (${campos.join(", ")}, busqueda, creada, actualizada) VALUES (${campos.map(() => "?").join(", ")}, ?, ?, ?)`)
        .run(...campos.map((c) => fila[c] ?? null), fila.busqueda, fila.creada, fila.actualizada);
      fila.id = Number(r.lastInsertRowid);
      if (!datos.hubspot_id) this.registrarActividad({ tipo: "nota", texto: "Empresa creada en el CRM", empresa_id: fila.id, autor }, false);
    }
    this.cambio();
    return this.empresa(fila.id ?? actual.id);
  }

  empresa(id) {
    return this.uno("SELECT * FROM empresas WHERE id = ?", Number(id));
  }

  buscarEmpresas({ q = "", tipo = "", sinActividadDias = 0, limite = 50, desplazamiento = 0 } = {}) {
    const filtros = [];
    const p = [];
    for (const palabra of normalizar(q).split(/\s+/).filter(Boolean)) {
      filtros.push("e.busqueda LIKE ?");
      p.push(`%${palabra}%`);
    }
    if (tipo) {
      filtros.push("e.tipo = ?");
      p.push(tipo);
    }
    const ultima = "(SELECT MAX(fecha) FROM actividades a WHERE a.empresa_id = e.id)";
    if (sinActividadDias > 0) {
      filtros.push(`(${ultima} IS NULL OR ${ultima} < ?)`);
      p.push(new Date(Date.now() - sinActividadDias * 86400000).toISOString());
    }
    const donde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
    const total = this.uno(`SELECT COUNT(*) AS n FROM empresas e ${donde}`, ...p).n;
    const filas = this.todos(
      `SELECT e.id, e.nombre, e.tipo, e.sector, e.ciudad, e.pais, e.responsable,
        (SELECT COUNT(*) FROM contactos c WHERE c.empresa_id = e.id) AS contactos,
        (SELECT COUNT(*) FROM negocios n WHERE n.empresa_id = e.id AND n.etapa NOT IN ('ganado','perdido')) AS negocios_abiertos,
        (SELECT COALESCE(SUM(valor),0) FROM negocios n WHERE n.empresa_id = e.id AND n.etapa = 'ganado') AS valor_ganado,
        ${ultima} AS ultima_actividad
       FROM empresas e ${donde} ORDER BY ultima_actividad IS NULL, ultima_actividad DESC, e.nombre LIMIT ? OFFSET ?`,
      ...p,
      limite,
      desplazamiento,
    );
    return { total, filas };
  }

  fichaEmpresa(id) {
    const empresa = this.empresa(id);
    if (!empresa) return null;
    return {
      empresa,
      contactos: this.todos("SELECT * FROM contactos WHERE empresa_id = ? ORDER BY nombre", empresa.id),
      negocios: this.todos("SELECT * FROM negocios WHERE empresa_id = ? ORDER BY cerrado IS NOT NULL, actualizado DESC", empresa.id),
      actividades: this.todos("SELECT * FROM actividades WHERE empresa_id = ? ORDER BY fecha DESC LIMIT 50", empresa.id),
    };
  }

  // ---- Contactos ----
  guardarContacto(datos) {
    const campos = ["empresa_id", "nombre", "apellidos", "cargo", "email", "telefono", "linkedin", "consentimiento", "notas", "hubspot_id"];
    const actual = datos.id ? this.uno("SELECT * FROM contactos WHERE id = ?", Number(datos.id)) : null;
    if (datos.id && !actual) throw new Error(`No existe el contacto ${datos.id}.`);
    const fila = { ...(actual ?? { consentimiento: "desconocido" }) };
    for (const c of campos) if (datos[c] !== undefined) fila[c] = vacioANull(datos[c]);
    if (!fila.nombre) throw new Error("El contacto necesita un nombre.");
    if (fila.empresa_id) {
      fila.empresa_id = Number(fila.empresa_id);
      if (!this.empresa(fila.empresa_id)) throw new Error(`No existe la empresa ${fila.empresa_id}.`);
    }
    if (!CONSENTIMIENTOS.includes(fila.consentimiento ?? "desconocido")) throw new Error("Consentimiento no válido.");
    const nombreEmpresa = fila.empresa_id ? this.empresa(fila.empresa_id).nombre : "";
    fila.busqueda = normalizar([fila.nombre, fila.apellidos, fila.cargo, fila.email, nombreEmpresa].filter(Boolean).join(" "));
    fila.actualizado = ahora();

    let id = actual?.id;
    if (actual) {
      this.db
        .prepare(`UPDATE contactos SET ${campos.map((c) => `${c} = ?`).join(", ")}, busqueda = ?, actualizado = ? WHERE id = ?`)
        .run(...campos.map((c) => fila[c] ?? null), fila.busqueda, fila.actualizado, id);
    } else {
      const r = this.db
        .prepare(`INSERT INTO contactos (${campos.join(", ")}, busqueda, creado, actualizado) VALUES (${campos.map(() => "?").join(", ")}, ?, ?, ?)`)
        .run(...campos.map((c) => fila[c] ?? null), fila.busqueda, fila.actualizado, fila.actualizado);
      id = Number(r.lastInsertRowid);
    }
    this.cambio();
    return this.uno("SELECT * FROM contactos WHERE id = ?", id);
  }

  buscarContactos({ q = "", empresaId = null, limite = 50, desplazamiento = 0 } = {}) {
    const filtros = [];
    const p = [];
    for (const palabra of normalizar(q).split(/\s+/).filter(Boolean)) {
      filtros.push("c.busqueda LIKE ?");
      p.push(`%${palabra}%`);
    }
    if (empresaId) {
      filtros.push("c.empresa_id = ?");
      p.push(Number(empresaId));
    }
    const donde = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
    const total = this.uno(`SELECT COUNT(*) AS n FROM contactos c ${donde}`, ...p).n;
    const filas = this.todos(
      `SELECT c.id, c.nombre, c.apellidos, c.cargo, c.email, c.telefono, c.linkedin, c.consentimiento, c.empresa_id, e.nombre AS empresa
       FROM contactos c LEFT JOIN empresas e ON e.id = c.empresa_id ${donde}
       ORDER BY c.actualizado DESC LIMIT ? OFFSET ?`,
      ...p,
      limite,
      desplazamiento,
    );
    return { total, filas };
  }

  // ---- Negocios ----
  guardarNegocio(datos, autor = "ceo") {
    const campos = ["titulo", "empresa_id", "contacto_id", "etapa", "valor", "cierre_previsto", "proximo_paso", "proximo_paso_fecha", "responsable", "motivo_cierre", "hubspot_id", "hubspot_etapa", "cerrado"];
    const actual = datos.id ? this.negocio(datos.id) : null;
    if (datos.id && !actual) throw new Error(`No existe el negocio ${datos.id}.`);
    const fila = { ...(actual ?? { etapa: "nuevo" }) };
    for (const c of campos) if (datos[c] !== undefined) fila[c] = vacioANull(datos[c]);
    if (!fila.titulo) throw new Error("El negocio necesita un título.");
    if (!ETAPAS_NEGOCIO.includes(fila.etapa)) throw new Error(`Etapa no válida: ${fila.etapa}`);
    if (fila.empresa_id) {
      fila.empresa_id = Number(fila.empresa_id);
      if (!this.empresa(fila.empresa_id)) throw new Error(`No existe la empresa ${fila.empresa_id}.`);
    }
    if (fila.contacto_id) fila.contacto_id = Number(fila.contacto_id);
    if (fila.valor !== null && fila.valor !== undefined) {
      fila.valor = Number(fila.valor);
      if (!Number.isFinite(fila.valor)) throw new Error("El valor debe ser un número.");
    }
    const cerrado = ["ganado", "perdido"].includes(fila.etapa);
    if (cerrado && !fila.cerrado) fila.cerrado = ahora();
    if (!cerrado) fila.cerrado = null;
    fila.actualizado = ahora();

    let id = actual?.id;
    if (actual) {
      this.db
        .prepare(`UPDATE negocios SET ${campos.map((c) => `${c} = ?`).join(", ")}, actualizado = ? WHERE id = ?`)
        .run(...campos.map((c) => fila[c] ?? null), fila.actualizado, id);
      if (actual.etapa !== fila.etapa && !datos.hubspot_id) {
        this.registrarActividad(
          { tipo: "nota", texto: `Etapa: ${actual.etapa} → ${fila.etapa}${fila.motivo_cierre && cerrado ? `. Motivo: ${fila.motivo_cierre}` : ""}`, empresa_id: fila.empresa_id, negocio_id: id, autor },
          false,
        );
      }
    } else {
      const r = this.db
        .prepare(`INSERT INTO negocios (${campos.join(", ")}, creado, actualizado) VALUES (${campos.map(() => "?").join(", ")}, ?, ?)`)
        .run(...campos.map((c) => fila[c] ?? null), fila.actualizado, fila.actualizado);
      id = Number(r.lastInsertRowid);
      if (!datos.hubspot_id) {
        this.registrarActividad({ tipo: "nota", texto: `Negocio creado: ${fila.titulo}`, empresa_id: fila.empresa_id, negocio_id: id, autor }, false);
      }
    }
    this.cambio();
    return this.negocio(id);
  }

  negocio(id) {
    return this.uno(
      `SELECT n.*, e.nombre AS empresa, TRIM(COALESCE(c.nombre,'') || ' ' || COALESCE(c.apellidos,'')) AS contacto
       FROM negocios n LEFT JOIN empresas e ON e.id = n.empresa_id LEFT JOIN contactos c ON c.id = n.contacto_id WHERE n.id = ?`,
      Number(id),
    );
  }

  fichaNegocio(id) {
    const negocio = this.negocio(id);
    if (!negocio) return null;
    return {
      negocio,
      contactos: negocio.empresa_id ? this.todos("SELECT id, nombre, apellidos, cargo, email, telefono, consentimiento FROM contactos WHERE empresa_id = ? ORDER BY nombre", negocio.empresa_id) : [],
      actividades: this.todos("SELECT * FROM actividades WHERE negocio_id = ? ORDER BY fecha DESC LIMIT 50", negocio.id),
    };
  }

  // Negocios para el tablero: todos los abiertos y los cerrados de los últimos 90 días.
  tablero() {
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();
    return this.todos(
      `SELECT n.id, n.titulo, n.etapa, n.valor, n.cierre_previsto, n.proximo_paso, n.proximo_paso_fecha, n.responsable,
        n.motivo_cierre, n.actualizado, n.cerrado, n.empresa_id, e.nombre AS empresa,
        TRIM(COALESCE(c.nombre,'') || ' ' || COALESCE(c.apellidos,'')) AS contacto
       FROM negocios n LEFT JOIN empresas e ON e.id = n.empresa_id LEFT JOIN contactos c ON c.id = n.contacto_id
       WHERE n.etapa NOT IN ('ganado','perdido') OR n.cerrado >= ?
       ORDER BY n.actualizado DESC`,
      desde,
    );
  }

  resumen() {
    const hoy = ahora().slice(0, 10);
    const inicioMes = `${hoy.slice(0, 7)}-01`;
    const abiertos = this.todos("SELECT etapa, valor, proximo_paso_fecha FROM negocios WHERE etapa NOT IN ('ganado','perdido')");
    const ganadosMes = this.uno("SELECT COUNT(*) AS n, COALESCE(SUM(valor),0) AS valor FROM negocios WHERE etapa = 'ganado' AND cerrado >= ?", inicioMes);
    const cerrados90 = this.uno(
      "SELECT SUM(etapa = 'ganado') AS ganados, COUNT(*) AS total FROM negocios WHERE etapa IN ('ganado','perdido') AND cerrado >= ?",
      new Date(Date.now() - 90 * 86400000).toISOString(),
    );
    return {
      empresas: this.uno("SELECT COUNT(*) AS n FROM empresas").n,
      contactos: this.uno("SELECT COUNT(*) AS n FROM contactos").n,
      abiertos: abiertos.length,
      valorAbierto: abiertos.reduce((s, n) => s + (n.valor ?? 0), 0),
      valorPonderado: Math.round(abiertos.reduce((s, n) => s + ((n.valor ?? 0) * PROBABILIDAD[n.etapa]) / 100, 0)),
      pasosVencidos: abiertos.filter((n) => n.proximo_paso_fecha && n.proximo_paso_fecha < hoy).length,
      sinProximoPaso: abiertos.filter((n) => !n.proximo_paso_fecha).length,
      ganadosMes: ganadosMes.n,
      valorGanadoMes: ganadosMes.valor,
      tasaCierre: cerrados90.total ? Math.round((100 * cerrados90.ganados) / cerrados90.total) : null,
    };
  }

  // ---- Actividades ----
  registrarActividad({ tipo, texto, empresa_id = null, contacto_id = null, negocio_id = null, autor = "ceo", fecha = null, hubspot_id = null }, avisar = true) {
    if (!TIPOS_ACTIVIDAD.includes(tipo)) throw new Error(`Tipo de actividad no válido: ${tipo}`);
    if (!String(texto ?? "").trim()) throw new Error("La actividad está vacía.");
    if (negocio_id && !empresa_id) empresa_id = this.negocio(negocio_id)?.empresa_id ?? null;
    if (contacto_id && !empresa_id) empresa_id = this.uno("SELECT empresa_id FROM contactos WHERE id = ?", Number(contacto_id))?.empresa_id ?? null;
    if (!empresa_id && !contacto_id && !negocio_id) throw new Error("Indica la empresa, el contacto o el negocio.");
    const r = this.db
      .prepare("INSERT OR IGNORE INTO actividades (tipo, texto, empresa_id, contacto_id, negocio_id, autor, fecha, hubspot_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(tipo, String(texto).trim(), empresa_id && Number(empresa_id), contacto_id && Number(contacto_id), negocio_id && Number(negocio_id), autor, fecha ?? ahora(), hubspot_id);
    if (avisar) this.cambio();
    return { id: Number(r.lastInsertRowid) };
  }

  idPorHubspot(tabla, hubspotId) {
    return hubspotId ? (this.uno(`SELECT id FROM ${tabla} WHERE hubspot_id = ?`, String(hubspotId))?.id ?? null) : null;
  }
}
