// @ts-check

import path from "node:path"
import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import seatbelt from "eslint-seatbelt"
import { includeIgnoreFile } from "@eslint/compat"
import { fileURLToPath } from "node:url"

console.log(seatbelt)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const gitignorePath = path.resolve(__dirname, ".gitignore")

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  seatbelt.configs.enable,
)
