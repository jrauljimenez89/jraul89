// Importa la base de HubSpot al CRM desde la terminal: npm run importar-hubspot
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Crm } from "../src/crm.js";
import { importarHubspot } from "../src/hubspot.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const crm = new Crm(path.join(raiz, "data/crm.db"));
let ultimaFase = "";

try {
  const c = await importarHubspot({
    crm,
    token: process.env.HUBSPOT_TOKEN,
    progreso: (p) => {
      const linea = `${p.fase}: ${p.empresas} empresas · ${p.contactos} contactos · ${p.negocios} negocios · ${p.notas} notas`;
      if (p.fase !== ultimaFase || process.stdout.isTTY) process.stdout.write((process.stdout.isTTY ? "\r" : "") + linea + (process.stdout.isTTY ? "   " : "\n"));
      ultimaFase = p.fase;
    },
  });
  console.log(`\nListo. ${c.empresas} empresas, ${c.contactos} contactos, ${c.negocios} negocios y ${c.notas} notas.`);
  for (const aviso of c.avisos) console.log(`Aviso: ${aviso}`);
} catch (err) {
  console.error(`\nNo se pudo importar: ${err.message}`);
  process.exitCode = 1;
}
