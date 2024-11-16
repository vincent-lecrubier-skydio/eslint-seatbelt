import type { ESLint, Linter } from "eslint"
import packageJson from "../package.json"
import { SeatbeltStateFile } from "./SeatbeltStateFile"
import { SEATBELT_FROZEN, SeatbeltArgs } from "./SeatbeltConfig"
import { SeatbeltProcessor } from "./SeatbeltProcessor"
import { configure } from "./rules/configure"
const { name, version } = packageJson

/**
 *
 */
const plugin: ESLint.Plugin = {
  meta: {
    name,
    version,
  },
  /**
   * https://eslint.org/docs/latest/extend/custom-processors
   */
  processors: {
    seatbelt: SeatbeltProcessor,
  },
  rules: {
    configure,
  },
}

export default plugin
