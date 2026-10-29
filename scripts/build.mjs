import { build } from "esbuild";

// The build id is shown in the dashboard so you can tell which version is running.
const id = new Date().toISOString().slice(0, 19).replace("T", " ");
await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: "dist/agent.cjs",
  logLevel: "warning",
  define: { __BUILD__: JSON.stringify(id) },
});
console.log("built", id);
