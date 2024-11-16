#!/usr/bin/env -S pnpm exec tsx

import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import * as TJS from "typescript-json-schema"

const root = resolve(__dirname, "..")

const program = TJS.getProgramFromFiles(
  [resolve(root, "src/SeatbeltConfig.ts")],
  undefined,
  root,
)

const schema = TJS.generateSchema(program, "SeatbeltConfig")

writeFileSync(
  resolve(root, "src/jsonSchema/SeatbeltConfig.json"),
  JSON.stringify(schema, null, 2),
)
