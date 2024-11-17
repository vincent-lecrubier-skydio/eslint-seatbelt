// @ts-check

import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import seatbelt from "eslint-seatbelt"

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  seatbelt.configs.enable,
)
