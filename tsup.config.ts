import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/api.ts", "src/command.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  cjsInterop: true,
  target: "node18",
})
