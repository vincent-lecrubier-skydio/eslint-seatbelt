import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/api.ts", "src/command.ts"],
  format: ["cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
})
