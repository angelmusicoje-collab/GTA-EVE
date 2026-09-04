import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "index.html",
  "styles.css",
  "game.js",
  "Dockerfile",
  "nginx.conf",
  "docker-compose.yml",
  "GAME_BIBLE.md",
  "POLISH_AUDIT.md",
];

for (const file of required) {
  if (!existsSync(resolve(root, file))) throw new Error(`Falta el archivo obligatorio: ${file}`);
}

const html = readFileSync(resolve(root, "index.html"), "utf8");
const script = readFileSync(resolve(root, "game.js"), "utf8");

if (!html.includes('src="game.js')) throw new Error("index.html no carga game.js");
if (!html.includes('href="styles.css')) throw new Error("index.html no carga styles.css");

const idList = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const idsInHtml = new Set(idList);
const queriedIds = new Set([...script.matchAll(/\$\("#([^"]+)"\)/g)].map((match) => match[1]));
const missingIds = [...queriedIds].filter((id) => !idsInHtml.has(id));

if (missingIds.length) throw new Error(`JavaScript busca IDs inexistentes: ${missingIds.join(", ")}`);
if (idsInHtml.size !== idList.length) throw new Error("Hay IDs duplicados en index.html");

console.log(`Comprobación terminada: ${required.length} archivos y ${queriedIds.size} enlaces de interfaz correctos.`);
