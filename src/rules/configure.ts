import type { Rule } from "eslint"
import { SeatbeltConfigSchema } from "../jsonSchema/SeatbeltConfigSchema"
import { name } from "../../package.json"
import { SeatbeltConfig } from "../SeatbeltConfig"
import * as pluginGlobals from "../pluginGlobals"

/**
 * This rule is required to capture the `seatbelt` configuration from the ESLint
 * config.
 */
export const configure: Rule.RuleModule = {
  meta: {
    docs: {
      description: `Applies ${name} configuration from ESLint config`,
      url: `https://github.com/justjake/${name}`,
    },
    schema: SeatbeltConfigSchema,
  },
  create(context) {
    const eslintSharedConfig = context.settings?.seatbelt as
      | SeatbeltConfig
      | undefined
    const fileOverrideConfig = context.options[0] as SeatbeltConfig | undefined
    const args = pluginGlobals.ruleOverrideConfigToArgs(
      eslintSharedConfig,
      fileOverrideConfig,
    )
    pluginGlobals.pushFileArgs(context.getFilename(), args)

    // No linting happening here.
    return {}
  },
}
