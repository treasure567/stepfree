import { copyFileSync, mkdirSync } from "fs";

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];
const src = "node_modules/maplibre-gl/dist";
const dest = "public";

mkdirSync(dest, { recursive: true });
for (const file of files) {
  copyFileSync(`${src}/${file}`, `${dest}/${file}`);
  console.log(`copied ${file} -> ${dest}/${file}`);
}
