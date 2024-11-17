import * as os from "node:os"
import * as fs from "node:fs"
import * as nodePath from "node:path"
import {
  formatFilename,
  formatRuleId,
  SEATBELT_FROZEN,
  SEATBELT_KEEP,
  SeatbeltArgs,
} from "./SeatbeltConfig"
import { name } from "../package.json"
import { appendErrorContext, isErrno } from "./errorHanding"

export type SourceFileName = string
export type RuleId = string

interface SeatbeltFileLine {
  encoded?: string
  filename: SourceFileName
  ruleId: RuleId
  maxErrors: number
}

export type SeatbeltFileJson = Record<SourceFileName, Record<RuleId, number>>

function encodeLine(line: SeatbeltFileLine): string {
  const { filename, ruleId, maxErrors } = line
  return `${JSON.stringify(filename)}\t${JSON.stringify(ruleId)}\t${maxErrors}\n`
}

function decodeLine(line: string, index: number): SeatbeltFileLine {
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
      appendErrorContext(e, "at tab-separated column 1 (filename)")
      throw e
    }

    let ruleId: RuleId
    try {
      ruleId = JSON.parse(lineParts[1])
    } catch (e) {
      appendErrorContext(e, "at tab-separated column 2 (RuleId)")
      throw e
    }

    let maxErrors: number
    try {
      maxErrors = JSON.parse(lineParts[2])
    } catch (e) {
      appendErrorContext(e, "at tab-separated column 3 (maxErrors)")
      throw e
    }

    return {
      encoded: line,
      filename,
      ruleId,
      maxErrors,
    }
  } catch (e) {
    appendErrorContext(e, `at line ${index + 1}: \`${line.trim()}\``)
    throw e
  }
}

interface SeatbeltStateFileData {
  maxErrors?: Map<RuleId, number>
  lines: SeatbeltFileLine[]
}

const COMMENT_LINE_REGEX = /^\s*#/

const DEFAULT_FILE_HEADER = `
# ${name} temporarily allowed errors
# docs: https://github.com/justjake/${name}#readme
`.trim()

/**
 * The state file is a Map<filename, Map<ruleId, allowedErrors>>.
 * It is stored in "tab separated json" format. This format is chosen over JSON
 * or YAML because each line is independent, which makes resolving merge
 * conflicts much easier than in a syntactically hierarchical format.
 */
export class SeatbeltFile {
  static readSync(filename: string): SeatbeltFile {
    const text = fs.readFileSync(filename, "utf8")
    try {
      return SeatbeltFile.parse(filename, text)
    } catch (e) {
      appendErrorContext(e, `in seatbelt file \`${filename}\``)
      throw e
    }
  }

  /**
   * Read `filename` if it exists, otherwise create a new empty seatbelt file object
   * that will write to that filename.
   */
  static openSync(filename: string): SeatbeltFile {
    try {
      return SeatbeltFile.readSync(filename)
    } catch (e) {
      if (isErrno(e, "ENOENT")) {
        return new SeatbeltFile(filename, new Map())
      }
      throw e
    }
  }

  static parse(filename: string, text: string): SeatbeltFile {
    const data = new Map<SourceFileName, SeatbeltStateFileData>()
    const split = text.split(/(?<=\n)/)
    const lines = split
      .filter(
        (line) =>
          line !== "" && line !== "\n" && !COMMENT_LINE_REGEX.test(line),
      )
      .map(decodeLine)
    const comments = split
      .filter((line) => COMMENT_LINE_REGEX.test(line))
      .join("")
    lines.forEach((line) => {
      let fileState = data.get(line.filename)
      if (!fileState) {
        fileState = { maxErrors: undefined, lines: [] }
        data.set(line.filename, fileState)
      }
      fileState.lines.push(line)
    })
    return new SeatbeltFile(filename, data, comments.trim())
  }

  static fromJSON(filename: string, json: SeatbeltFileJson): SeatbeltFile {
    const data = new Map(
      Object.entries(json).map(([filename, maxErrors]) => [
        filename,
        { maxErrors: new Map(Object.entries(maxErrors)), lines: [] },
      ]),
    )
    return new SeatbeltFile(filename, data)
  }

  constructor(
    public filename: string,
    protected data: Map<SourceFileName, SeatbeltStateFileData>,
    public readonly comments: string = DEFAULT_FILE_HEADER,
  ) {}

  public changed = false

  filenames(): IterableIterator<SourceFileName> {
    return this.data.keys()
  }

  getMaxErrors(
    filename: SourceFileName,
  ): ReadonlyMap<RuleId, number> | undefined {
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
    ruleToErrorCount: ReadonlyMap<RuleId, number>,
  ) {
    const removedRules = new Set<RuleId>()
    let increasedRulesCount = 0
    let decreasedRulesCount = 0
    this.getMaxErrors(filename)
    const maxErrors =
      this.data.get(filename)?.maxErrors ?? new Map<RuleId, number>()

    ruleToErrorCount.forEach((errorCount, ruleId) => {
      const maxErrorCount = maxErrors.get(ruleId) ?? 0
      if (errorCount === maxErrorCount) {
        return
      }

      if (
        errorCount < maxErrorCount ||
        SeatbeltArgs.ruleSetHas(args.allowIncreaseRules, ruleId)
      ) {
        SeatbeltArgs.verboseLog(args, () =>
          args.frozen
            ? `${formatFilename(filename)}: ${formatRuleId(ruleId)}: ${SEATBELT_FROZEN}: didn't update max errors ${maxErrorCount} -> ${errorCount}`
            : `${formatFilename(filename)}: ${formatRuleId(ruleId)}: update max errors ${maxErrorCount} -> ${errorCount}`,
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
        const shouldRemove =
          maxErrorCount === 0 || !ruleToErrorCount.has(ruleId)

        if (!shouldRemove) {
          return
        }

        if (SeatbeltArgs.ruleSetHas(args.keepRules, ruleId)) {
          SeatbeltArgs.verboseLog(
            args,
            () =>
              `${formatFilename(filename)}: ${formatRuleId(ruleId)}: ${SEATBELT_KEEP}: didn't update max errors ${maxErrorCount} -> ${0}`,
          )
          return
        }

        SeatbeltArgs.verboseLog(args, () =>
          args.frozen
            ? `${formatFilename(filename)}: ${formatRuleId(ruleId)}: ${SEATBELT_FROZEN}: didn't update max errors ${maxErrorCount} -> ${0}`
            : `${formatFilename(filename)}: ${formatRuleId(ruleId)}: update max errors ${maxErrorCount} -> ${0}`,
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
    return this.comments + "\n\n" + lines.join("")
  }

  readSync() {
    const nextStateFile = SeatbeltFile.openSync(this.filename)
    if (nextStateFile) {
      this.data = nextStateFile.data
      this.changed = false
      return true
    }
    return false
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
    const dir = nodePath.dirname(this.filename)
    const base = nodePath.basename(this.filename)
    const tempFile = nodePath.join(
      os.tmpdir(),
      `.${base}.wip${process.pid}.${Date.now()}.tmp`,
    )
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(tempFile, dataString, "utf8")
    fs.renameSync(tempFile, this.filename)
  }

  toJSON(): SeatbeltFileJson {
    return Object.fromEntries(
      Array.from(this.data.keys()).map((filename) => {
        const maxErrors = this.getMaxErrors(filename)
        if (!maxErrors) {
          throw new Error(`${name} bug: expected errors for existing key`)
        }
        return [filename, Object.fromEntries(maxErrors)]
      }),
    )
  }
}

function parseMaxErrors(lines: SeatbeltFileLine[]): Map<RuleId, number> {
  const maxErrors = new Map<RuleId, number>()
  lines.forEach((line) => {
    maxErrors.set(line.ruleId, line.maxErrors)
  })
  return maxErrors
}
