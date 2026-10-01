// Genera demo/oficina-demo.html: la oficina en un solo archivo, con datos de ejemplo
// y sin servidor, para enseñarla o publicarla como página.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leer = (r) => fs.readFileSync(path.join(raiz, r), "utf8");

const equipo = JSON.parse(leer("config/equipo.json"));
equipo.agentes = equipo.agentes.filter((a) => a.activo !== false);
const estado = JSON.parse(leer("demo/estado-ejemplo.json"));
const html = leer("public/index.html");

const cuerpo = html.slice(html.indexOf("<header"), html.indexOf('<script src="app.js">'));
const fuentes = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const datos = JSON.stringify({ equipo, estado }).replace(/</g, "\\u003c");

const salida = `<title>Oficina Green Interlink</title>
${fuentes}
<style>
${leer("public/estilos.css")}
</style>
${cuerpo}
<script>window.DEMO = ${datos};</script>
<script>
${leer("public/app.js")}
</script>
`;
fs.writeFileSync(path.join(raiz, "demo/oficina-demo.html"), salida);
console.log("Demo generada en demo/oficina-demo.html");
