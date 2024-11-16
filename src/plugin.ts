/**
 * https://eslint.org/docs/latest/extend/custom-processors
 */
import type { ESLint, Linter } from "eslint"
import packageJson from "../package.json"
import { SeatbeltStateFile } from "./SeatbeltStateFile"

const { name, version } = packageJson

//eslint.org/docs/latest/extend/custom-processors
const plugin: ESLint.Plugin = {
  meta: {
    name,
    version,
  },
  processors: {
    seatbelt: {
      supportsAutofix: true,
      meta: {
        name,
        version,
      },
      // takes text of the file and filename
      preprocess(text, filename) {
        return [text]
      },

      /**
       * seatbelt works by observing the list messages and filtering out
       * messages that are allowed by the seatbelt file. Note that ESLint is a
       * completely synchronous codebase, so we also need to be synchronous.
       */
      postprocess([messages], filename) {
        // takes a Message[][] and filename
        // `messages` argument contains two-dimensional array of Message objects
        // where each top-level array item contains array of lint messages related
        // to the text that was returned in array from preprocess() method

        const ruleToMaxErrorCount = readState(filename)
        if (!ruleToMaxErrorCount) {
          // We have no state related to this file, so no need to consider it.
          return messages
        }

        const ruleToErrorCount = countRuleIds(messages)

        const result: Linter.LintMessage[] = []
        messages.map((message) => {
          const errorCount = ruleToErrorCount.get(message.ruleId)
          const maxErrorCount = ruleToMaxErrorCount.get(message.ruleId)
          if (maxErrorCount === undefined) {
            // Rule not controlled by seatbelt, just pass it through unchanged.
            return message
          } else if (errorCount > maxErrorCount) {
            // Rule controlled by seatbelt, but too many errorCount:
            // keep the message as an error, but add a notice about seatbelt
            // violation count
            return messageOverMaxErrorCount(message, errorCount, maxErrorCount)
          } else if (errorCount === maxErrorCount) {
            // For rules under the limit, turn errors into warnings.
            // Add an appropriate notice about seatbelt violation status.
            return messageAtMaxErrorCount(message, errorCount)
          } else {
            // Can tighten the seatbelt.
            return messageUnderMaxErrorCount(message, errorCount, maxErrorCount)
          }
        })

        maybeWriteStateUpdate(filename, ruleToerrorCount)

        // you need to return a one-dimensional array of the messages you want to keep
        return result
      },

      supportsAutofix: true, // (optional, defaults to false)
    },
  },
}

type RuleId = string

function readState(filename: string): Map<RuleId, number> {
  return SeatbeltStateFile.forFile(filename)?.getFileState(filename)
}

function maybeWriteStateUpdate(
  filename: string,
  ruleToErrorCount: Map<RuleId, number>,
) {
  SeatbeltStateFile.forFile(filename)?.updateState(
    SeatbeltArgs.shared(),
    ruleToErrorCount,
  )
}

function messageOverMaxErrorCount(
  message: Linter.LintMessage,
  errorCount: number,
  maxErrorCount: number,
): Linter.LintMessage {
  return {
    ...message,
    message: `${message.message}
[${name}]: There are ${errorCount} errors of this type, but only ${maxErrorCount} are allowed.
Remove ${errorCount - maxErrorCount} to turn these errors into warnings.
    `.trim(),
  }
}

function messageAtMaxErrorCount(
  message: Linter.LintMessage,
  errorCount: number,
): Linter.LintMessage {
  return {
    ...message,
    severity: 1,
    message: `${message.message}
[${name}]: This file is temporarily allowed to have ${errorCount} errors of this type.
Please tend the garden by fixing it if you have the time.
    `.trim(),
  }
}

function messageUnderMaxErrorCount(
  message: Linter.LintMessage,
  errorCount: number,
  maxErrorCount: number,
): Linter.LintMessage {
  const fixed = errorCount - maxErrorCount
  const fixedMessage = fixed === 1 ? "error" : "errors"
  return {
    ...message,
    severity: 1,
    message: `${message.message}
[${name}]: This file is allowed to have ${maxErrorCount} errors of this type.
Thank you for fixing ${fixed} ${fixedMessage}, it really helps.
    `.trim(),
  }
}

export default plugin
