// Decide quién trabaja a continuación. Atiende primero los mensajes nuevos,
// después las tareas pendientes y, por último, retoma tareas en curso que llevan un rato paradas.
const INTERVALO_MS = Number(process.env.INTERVALO_SEGUNDOS || 10) * 1000;
const MAX_TURNOS_DIA = Number(process.env.MAX_TURNOS_DIA || 150);
const RETOMAR_MIN = Number(process.env.RETOMAR_TAREAS_MINUTOS || 30);
const EN_PARALELO = Number(process.env.AGENTES_EN_PARALELO || 2);

export class Orquestador {
  constructor({ equipo, store, ejecutor }) {
    this.equipo = equipo;
    this.store = store;
    this.ejecutor = ejecutor;
    this.ocupados = new Set();
  }

  iniciar() {
    // Al arrancar, nadie está trabajando todavía.
    for (const a of this.equipo.agentes) this.store.estadoAgente(a.id, "libre");
    this.timer = setInterval(() => this.ciclo(), INTERVALO_MS);
    this.ciclo();
  }

  siguienteTrabajo(agente) {
    const e = this.store.estado;
    const mensajes = this.store.bandeja(agente.id);
    const mias = e.tareas.filter((t) => t.asignadoA === agente.id).reverse(); // las más antiguas primero
    const pendiente = mias.find((t) => t.estado === "pendiente");
    const limite = Date.now() - RETOMAR_MIN * 60_000;
    const parada = mias.find((t) => t.estado === "en_curso" && Date.parse(t.actualizada) < limite);
    const tarea = pendiente ?? parada ?? null;
    if (!mensajes.length && !tarea) return null;
    return { mensajes, tarea };
  }

  ciclo() {
    if (this.store.estado.pausado) return;
    if (this.store.turnosHoy() >= MAX_TURNOS_DIA) return;

    for (const agente of this.equipo.agentes) {
      if (this.ocupados.size >= EN_PARALELO) break;
      if (this.ocupados.has(agente.id)) continue;
      const trabajo = this.siguienteTrabajo(agente);
      if (!trabajo) continue;

      this.ocupados.add(agente.id);
      this.ejecutor
        .turno(agente, trabajo)
        .finally(() => this.ocupados.delete(agente.id));
    }
  }
}

export const LIMITES = { MAX_TURNOS_DIA, EN_PARALELO };
