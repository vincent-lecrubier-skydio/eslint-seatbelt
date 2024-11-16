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
const plugin = {
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
  /**
   *
   */
  configs: {
    /**
     * Config preset for ESLint 9 and above.
     *
     * Usage:
     *
     * ```
     * // eslint.config.js
     * module.exports = [
     *   require("eslint-seatbelt").configs.enable,
     *   // ... your configs
     * ]
     */
    enable: createESLint9Config(),
    /**
     * Config preset for ESLint 8 and below.
     *
     * Usage:
     *
     * ```
     * // eslintrc.js
     * module.exports = {
     *   plugins: ["eslint-seatbelt"],
     *   extends: ["plugin:eslint-seatbelt/enable-legacy"],
     *   // ... your configs
     * }
     * ```
     *
     * https://eslint.org/docs/latest/use/configure/configuration-files-deprecated#using-a-configuration-from-a-plugin
     */
    "enable-legacy": createLegacyConfig(),
  },
} satisfies ESLint.Plugin

function createESLint9Config() {
  const ownPlugin: ESLint.Plugin = plugin
  return {
    name: `${name}/enable`,
    plugins: {
      [name]: ownPlugin,
    },
    rules: {
      [`${name}/configure`]: "error",
    },
    processor: `${name}/seatbelt`,
  } satisfies Linter.Config
}

function createLegacyConfig() {
  return {
    plugins: [name],
    rules: {
      [`${name}/configure`]: "error",
    },
    processor: `${name}/seatbelt`,
  } satisfies Linter.LegacyConfig
}

export default plugin
