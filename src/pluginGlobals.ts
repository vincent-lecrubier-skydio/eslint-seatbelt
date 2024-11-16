/**
 * Facilitates caching and passing of state between different parts of the plugin.
 */

import {
  FallbackEnv,
  logStderr,
  SeatbeltArgs,
  SeatbeltConfig,
  SeatbeltConfigWithPwd,
  SeatbeltEnv,
} from "./SeatbeltConfig"
import { SeatbeltStateFile } from "./SeatbeltStateFile"
import { name } from "../package.json"

const EMPTY_CONFIG: SeatbeltConfig = {}

const argsCache = new WeakMap<SeatbeltConfig, SeatbeltArgs>()
const seatbeltFileCache = new Map<string, SeatbeltStateFile>()
const mergedConfigCache = new WeakMap<
  /* settings.seatbelt */ SeatbeltConfig,
  WeakMap</* from rule settings override*/ SeatbeltConfig, SeatbeltConfig>
>()

let envFallbackConfig: SeatbeltConfig | undefined
let envOverrideConfig: SeatbeltConfigWithPwd | undefined
let hasAnyEnvVars = false
let lastLintedFile: { filename: string; args: SeatbeltArgs } | undefined

function getProcessEnvFallbackConfig(): SeatbeltConfig {
  return (
    envFallbackConfig ??
    SeatbeltConfig.fromFallbackEnv(process.env as FallbackEnv)
  )
}

function getProcessEnvOverrideConfig(): SeatbeltConfigWithPwd {
  if (!envOverrideConfig) {
    envOverrideConfig = SeatbeltConfig.fromEnvOverrides(
      process.env as SeatbeltEnv,
    )
    hasAnyEnvVars = Object.keys(envOverrideConfig).length > 0
  }
  return envOverrideConfig
}

export function ruleOverrideConfigToArgs(
  settingsConfig: SeatbeltConfig | undefined,
  ruleOverrideConfig: SeatbeltConfig | undefined,
): SeatbeltArgs {
  if (settingsConfig && ruleOverrideConfig) {
    let settingsConfigMergeMap = mergedConfigCache.get(settingsConfig)
    if (!settingsConfigMergeMap) {
      settingsConfigMergeMap = new WeakMap()
      mergedConfigCache.set(settingsConfig, settingsConfigMergeMap)
    }
    let mergedConfig = settingsConfigMergeMap.get(ruleOverrideConfig)
    if (!mergedConfig) {
      mergedConfig = { ...settingsConfig, ...ruleOverrideConfig }
      settingsConfigMergeMap.set(ruleOverrideConfig, mergedConfig)
    }
    return configToArgs(mergedConfig)
  }
  return configToArgs(ruleOverrideConfig ?? settingsConfig ?? EMPTY_CONFIG)
}

function configToArgs(config: SeatbeltConfig): SeatbeltArgs {
  let args = argsCache.get(config)
  if (!args) {
    const compiledConfig = {
      ...getProcessEnvFallbackConfig(),
      ...config,
      ...getProcessEnvOverrideConfig(),
    }
    args = SeatbeltArgs.fromConfig(compiledConfig)
    argsCache.set(config, args)
  }
  return args
}

const configureRuleName = `${name}/configure`

function logSetupGuide() {
  logStderr(
    `
Make sure you have rule ${configureRuleName} enabled in your ESLint config for all files:

  rules: {
    // ...
    "${configureRuleName}": "error",
  }

Docs: https://github.com/justjake/${name}#configure`,
  )
}

export function setFileArgs(filename: string, args: SeatbeltArgs) {
  lastLintedFile = { filename, args }
}

export function getFileArgs(filename: string): SeatbeltArgs {
  if (lastLintedFile?.filename === filename) {
    return lastLintedFile.args
  }
  if (!hasAnyEnvVars) {
    if (lastLintedFile) {
      logStderr(
        `WARNING: last configured by file \`${lastLintedFile.filename}\` but linting file \`${filename}\`.
You may have rule ${configureRuleName} enabled for some files, but not this one.
`.trim(),
      )
    } else {
      logStderr(
        `WARNING: rule ${configureRuleName} not enabled in ESLint config and no SEATBELT environment variables set`,
      )
    }
    logSetupGuide()
  }
  return configToArgs(EMPTY_CONFIG)
}

export function getSeatbeltFile(
  filename: string,
): SeatbeltStateFile | undefined {
  let seatbeltFile = seatbeltFileCache.get(filename)
  if (!seatbeltFile) {
    seatbeltFile = SeatbeltStateFile.readSync(filename)
    seatbeltFileCache.set(filename, seatbeltFile)
  }
  return seatbeltFile
}
