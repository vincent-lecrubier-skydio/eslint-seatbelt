import type { Linter } from "eslint"
import packageJson from "../package.json"
import { RuleId, SeatbeltStateFile } from "./SeatbeltStateFile"
import { SEATBELT_FROZEN, SeatbeltArgs } from "./SeatbeltConfig"

const { name, version } = packageJson

/**
 * seatbelt works by observing the list messages and filtering out
 * messages that are allowed by the seatbelt file. Note that ESLint is a
 * completely synchronous codebase, so we also need to be synchronous.
 *
 * https://eslint.org/docs/latest/extend/custom-processors
 */
export const SeatbeltProcessor: Linter.Processor = {
  supportsAutofix: true,
  meta: {
    name,
    version,
  },
  // takes text of the file and filename
  preprocess(text, filename) {
    // We don't need to do anything here, pass through the data unchanged.
    return [text]
  },

  /** Where the action happens. */
  postprocess([messages], filename) {
    // takes a Message[][] and filename
    // `messages` argument contains two-dimensional array of Message objects
    // where each top-level array item contains array of lint messages related
    // to the text that was returned in array from preprocess() method

    const args = SeatbeltArgs.currentProcess
    if (args.disable) {
      return messages
    }

    const ruleToMaxErrorCount = readState(filename)
    if (!ruleToMaxErrorCount) {
      // We have no state related to this file, so no need to consider it.
      return messages
    }

    const ruleToErrorCount = countRuleIds(messages)
    const verboseLoggedStatus = args.verbose ? new Set<RuleId>() : undefined
    const verboseOnce = (ruleId: RuleId) => {
      if (!verboseLoggedStatus) {
        return false
      }
      if (verboseLoggedStatus.has(ruleId)) {
        return false
      }
      verboseLoggedStatus.add(ruleId)
      return true
    }

    const result: Linter.LintMessage[] = []
    messages.map((message) => {
      if (message.ruleId === null) {
        return message
      }

      const errorCount = ruleToErrorCount.get(message.ruleId)
      if (errorCount === undefined) {
        return message
      }

      const maxErrorCount = ruleToMaxErrorCount.get(message.ruleId)
      if (maxErrorCount === undefined) {
        // Rule not controlled by seatbelt, just pass it through unchanged.
        return message
      } else if (errorCount > maxErrorCount) {
        // Rule controlled by seatbelt, but too many errorCount:
        // keep the message as an error, but add a notice about seatbelt
        // violation count
        if (verboseOnce(message.ruleId)) {
          SeatbeltArgs.verboseLog(
            args,
            () =>
              `${filename}: ${message.ruleId}: error: ${errorCount} ${pluralErrors(errorCount)} found > max ${maxErrorCount}`,
          )
        }
        return messageOverMaxErrorCount(message, errorCount, maxErrorCount)
      } else if (errorCount === maxErrorCount) {
        // For rules under the limit, turn errors into warnings.
        // Add an appropriate notice about seatbelt violation status.
        if (verboseOnce(message.ruleId)) {
          SeatbeltArgs.verboseLog(
            args,
            () =>
              `${filename}: ${message.ruleId}: ok: ${errorCount} ${pluralErrors(errorCount)} found == max ${maxErrorCount}`,
          )
        }

        return messageAtMaxErrorCount(message, errorCount)
      } else {
        if (args.frozen) {
          return messageFrozenUnderMaxErrorCount(
            message,
            filename,
            errorCount,
            maxErrorCount,
          )
        }
        // Can tighten the seatbelt.
        return messageUnderMaxErrorCount(message, errorCount, maxErrorCount)
      }
    })

    // Ideally we could find a way to batch writes until all linting is finished, but I haven't found a
    // good way to schedule our code to run after all files but before
    // ESLint returns to its caller or exits.
    const updateResult = maybeWriteStateUpdate(filename, ruleToErrorCount)

    if (
      args.frozen &&
      updateResult?.removedRules &&
      updateResult.removedRules.size > 0
    ) {
      // We didn't actually update the state file in this case.
      // We need to add an original error message about the inconsistent state.
      updateResult.removedRules.forEach((ruleId) => {
        const maxErrorCount = ruleToMaxErrorCount.get(ruleId)
        if (maxErrorCount === undefined) {
          throw new Error(
            `Seatbelt bug: maxErrorCount not found for removed frozen rule ${ruleId}`,
          )
        }
        result.push({
          ruleId,
          column: 0,
          line: 1,
          severity: 2,
          message: messageFrozenUnderMaxErrorCountText(
            filename,
            0,
            maxErrorCount,
          ),
        })
      })
    }

    // you need to return a one-dimensional array of the messages you want to keep
    return result
  },
}

function countRuleIds(messages: Linter.LintMessage[]): Map<RuleId, number> {
  const ruleToErrorCount = new Map<RuleId, number>()
  messages.forEach((message) => {
    if (message.ruleId === null) {
      return
    }
    ruleToErrorCount.set(
      message.ruleId,
      (ruleToErrorCount.get(message.ruleId) ?? 0) + 1,
    )
  })
  return ruleToErrorCount
}

function readState(filename: string): Map<RuleId, number> | undefined {
  const args = SeatbeltArgs.currentProcess
  return SeatbeltStateFile.shared(args.seatbeltFile)?.getMaxErrors(filename)
}

function maybeWriteStateUpdate(
  filename: string,
  ruleToErrorCount: Map<RuleId, number>,
) {
  const args = SeatbeltArgs.currentProcess
  if (args.disable) {
    return { updated: false, removedRules: undefined }
  }
  const stateFile = SeatbeltStateFile.shared(args.seatbeltFile)
  if (args.threadsafe) {
    // TODO: Implement locking
    // For now just refresh the file.
    stateFile.readSync()
  }
  const { removedRules } = stateFile.updateMaxErrors(
    filename,
    args,
    ruleToErrorCount,
  )
  const { updated } = stateFile.flushChanges()
  return { removedRules, updated }
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
Please tend the garden by fixing if you have the time.
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
[${name}]: This file is temporarily allowed to have ${maxErrorCount} errors of this type.
Thank you for fixing ${fixed} ${fixedMessage}, it really helps.
    `.trim(),
  }
}

function messageFrozenUnderMaxErrorCountText(
  seatbeltFilename: string,
  errorCount: number,
  maxErrorCount: number,
) {
  const fixed = errorCount - maxErrorCount
  const fixedMessage = fixed === 1 ? "error" : "errors"
  return `
[${name}]: ${SEATBELT_FROZEN}: Expected ${maxErrorCount} ${pluralErrors(maxErrorCount)}, found ${errorCount}.
If you fixed ${fixed} ${fixedMessage}, thank you, but you'll need to update the seatbelt file to match.
Try running eslint, then committing ${seatbeltFilename}.
`.trim()
}

function messageFrozenUnderMaxErrorCount(
  message: Linter.LintMessage,
  seatbeltFilename: string,
  errorCount: number,
  maxErrorCount: number,
): Linter.LintMessage {
  return {
    ...message,
    severity: 1,
    message: `${message.message}\n${messageFrozenUnderMaxErrorCountText(seatbeltFilename, errorCount, maxErrorCount)}`,
  }
}

function pluralErrors(count: number) {
  return count === 1 ? "error" : "errors"
}
