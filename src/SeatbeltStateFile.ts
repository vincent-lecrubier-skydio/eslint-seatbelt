import * as os from "node:os"
import * as fs from "node:fs"
import * as nodePath from "node:path"
import { SEATBELT_FROZEN, SEATBELT_KEEP, SeatbeltArgs } from "./SeatbeltConfig"

export type SourceFileName = string
export type RuleId = string

interface SeatbeltStateFileLine {
  encoded?: string
  filename: SourceFileName
  ruleId: RuleId
  maxErrors: number
}

function encodeLine(line: SeatbeltStateFileLine): string {
  const { filename, ruleId, maxErrors } = line
  return `${JSON.stringify(filename)}\t${JSON.stringify(ruleId)}\t${maxErrors}\n`
}

function decodeLine(line: string, index: number): SeatbeltStateFileLine {
  try {
    const lineParts = line.split("\t")
    if (lineParts.length !== 3) {
      throw new Error(
        `Expected 3 tab-separated JSON strings, instead have ${lineParts.length}`,
      )
    }
    let filename: string
    try {
      filename = JSON.parse(lineParts[0])
    } catch (e) {
      if (e instanceof Error) {
        e.message += `\n  at tab-separated column 1 (filename)`
      }
      throw e
    }

    let ruleId: RuleId
    try {
      ruleId = JSON.parse(lineParts[1])
    } catch (e) {
      if (e instanceof Error) {
        e.message += `\n  at tab-separated column 2 (RuleId)`
      }
      throw e
    }

    let maxErrors: number
    try {
      maxErrors = JSON.parse(lineParts[2])
    } catch (e) {
      if (e instanceof Error) {
        e.message += `\n  at tab-separated column 3 (maxErrors)`
      }
      throw e
    }

    return {
      encoded: line,
      filename,
      ruleId,
      maxErrors,
    }
  } catch (e) {
    if (e instanceof Error) {
      e.message += `\n  at line ${index + 1}: \`${line.trim()}\``
    }
    throw e
  }
}

interface SeatbeltStateFileData {
  maxErrors?: Map<RuleId, number>
  lines: SeatbeltStateFileLine[]
}

/**
 * The state file is a Map<filename, Map<ruleId, allowedErrors>>.
 * It is stored in "tab separated json" format. This format is chosen over JSON
 * or YAML because each line is independent, which makes resolving merge
 * conflicts much easier than in a syntactically hierarchical format.
 */
export class SeatbeltStateFile {
  static readSync(filename: string): SeatbeltStateFile {
    const text = fs.readFileSync(filename, "utf8")
    try {
      return SeatbeltStateFile.parse(filename, text)
    } catch (e) {
      if (e instanceof Error) {
        e.message += `\n  in seatbelt file \`${filename}\``
      }
      throw e
    }
  }

  /**
   * Read `filename` if it exists, otherwise create a new empty seatbelt file object
   * that will write to that filename.
   */
  static openSync(filename: string): SeatbeltStateFile {
    try {
      return SeatbeltStateFile.readSync(filename)
    } catch (e) {
      if (
        e instanceof Error &&
        (e as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return new SeatbeltStateFile(filename, new Map())
      }
      throw e
    }
  }

  static parse(filename: string, text: string): SeatbeltStateFile {
    const data = new Map<SourceFileName, SeatbeltStateFileData>()
    const lines = text.split("\n").map(decodeLine)
    lines.forEach((line) => {
      let fileState = data.get(line.filename)
      if (!fileState) {
        fileState = { maxErrors: undefined, lines: [] }
        data.set(line.filename, fileState)
      }
      fileState.lines.push(line)
    })
    return new SeatbeltStateFile(filename, data)
  }

  constructor(
    public filename: string,
    protected data: Map<SourceFileName, SeatbeltStateFileData>,
  ) {}

  public changed = false

  getMaxErrors(filename: SourceFileName): Map<RuleId, number> | undefined {
    const fileState = this.data.get(filename)
    if (!fileState) {
      return undefined
    }
    fileState.maxErrors ??= parseMaxErrors(fileState.lines)
    return fileState.maxErrors
  }

  updateMaxErrors(
    filename: SourceFileName,
    args: SeatbeltArgs,
    ruleToErrorCount: Map<RuleId, number>,
  ) {
    const removedRules = new Set<RuleId>()
    let increasedRulesCount = 0
    let decreasedRulesCount = 0
    const maxErrors = this.getMaxErrors(filename) ?? new Map()

    ruleToErrorCount.forEach((errorCount, ruleId) => {
      const maxErrorCount = maxErrors.get(ruleId) ?? 0
      if (errorCount === maxErrorCount) {
        return
      }

      if (
        args.allowIncreaseRules === "all" ||
        args.allowIncreaseRules.has(ruleId) ||
        errorCount < maxErrorCount
      ) {
        SeatbeltArgs.verboseLog(args, () =>
          args.frozen
            ? `${filename}: ${ruleId}: ${SEATBELT_FROZEN}: didn't update max errors: ${maxErrorCount} -> ${errorCount}`
            : `${filename}: ${ruleId}: update max errors: ${maxErrorCount} -> ${errorCount}`,
        )
        maxErrors.set(ruleId, errorCount)
        if (errorCount > maxErrorCount) {
          increasedRulesCount++
        } else {
          decreasedRulesCount++
        }
      }
    })

    if (args.verbose || args.keepRules !== "all") {
      maxErrors.forEach((maxErrorCount, ruleId) => {
        if (!ruleToErrorCount.has(ruleId)) {
          return
        }

        if (args.keepRules === "all" || args.keepRules.has(ruleId)) {
          SeatbeltArgs.verboseLog(
            args,
            () =>
              `${filename}: ${ruleId}: ${SEATBELT_KEEP}: didn't update max errors: ${maxErrorCount} -> ${0}`,
          )
          return
        }

        SeatbeltArgs.verboseLog(args, () =>
          args.frozen
            ? `${filename}: ${ruleId}: ${SEATBELT_FROZEN}: didn't update max errors: ${maxErrorCount} -> ${0}`
            : `${filename}: ${ruleId}: update max errors: ${maxErrorCount} -> ${0}`,
        )

        maxErrors.delete(ruleId)
        removedRules.add(ruleId)
      })
    }

    const changed =
      increasedRulesCount > 0 ||
      decreasedRulesCount > 0 ||
      removedRules.size > 0
    if (changed && !args.frozen) {
      const file = this.data.get(filename)
      if (file) {
        file.maxErrors = maxErrors
      } else {
        this.data.set(filename, {
          maxErrors,
          lines: [],
        })
      }
      this.changed = true
    }

    return { removedRules, increasedRulesCount, decreasedRulesCount }
  }

  toDataString(): string {
    const lines: string[] = []
    this.data.forEach((fileState, filename) => {
      if (fileState.maxErrors) {
        // Serialize maxErrors map structure if it exists, since it may have changes.
        fileState.lines = []
        fileState.maxErrors.forEach((maxErrorCount, ruleId) => {
          fileState.lines.push({ filename, ruleId, maxErrors: maxErrorCount })
        })
        fileState.lines.sort((a, b) =>
          a.ruleId === b.ruleId ? 0 : a.ruleId < b.ruleId ? -1 : 1,
        )
      }
      fileState.lines.forEach((line) => {
        const encoded = (line.encoded ??= encodeLine(line))
        lines.push(encoded)
      })
    })
    lines.sort()
    return lines.join("")
  }

  readSync() {
    const nextStateFile = SeatbeltStateFile.readSync(this.filename)
    this.data = nextStateFile.data
    this.changed = false
  }

  flushChanges() {
    if (this.changed) {
      this.writeSync()
      this.changed = false
      return { updated: true }
    }
    return { updated: false }
  }

  writeSync() {
    const dataString = this.toDataString()
    const { dir, base } = nodePath.parse(this.filename)
    const tempFile = nodePath.join(
      os.tmpdir(),
      `.${base}.wip${process.pid}.${Date.now()}.tmp`,
    )
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(tempFile, dataString, "utf8")
    fs.renameSync(tempFile, this.filename)
  }
}

function parseMaxErrors(lines: SeatbeltStateFileLine[]): Map<RuleId, number> {
  const maxErrors = new Map<RuleId, number>()
  lines.forEach((line) => {
    maxErrors.set(line.ruleId, line.maxErrors)
  })
  return maxErrors
}
