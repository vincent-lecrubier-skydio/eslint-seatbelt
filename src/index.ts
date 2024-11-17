import type { ESLint, Linter } from "eslint"
import packageJson from "../package.json"
import { SeatbeltProcessor } from "./SeatbeltProcessor"
import { configure } from "./rules/configure"
const { name, version } = packageJson

/**
 * See the package README for usage instructions.
 * https://github.com/justjake/eslint-seatbelt#readme
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
    enable: undefined as any as ReturnType<typeof createESLint9Config>,
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
    "enable-legacy": undefined as any as ReturnType<typeof createLegacyConfig>,
  },
} satisfies ESLint.Plugin & ESLint.Plugin

plugin.configs.enable = createESLint9Config()
plugin.configs["enable-legacy"] = createLegacyConfig()

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
