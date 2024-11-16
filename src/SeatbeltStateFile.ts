import * as fs from "node:fs"

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
      e.message += `\n  at line ${index + 1}`
    }
    throw e
  }
}

interface SeatbeltStateFileData {
  maxErrors?: Map<RuleId, number>
  lines: SeatbeltStateFileLine[]
}

interface SeatbeltArgs {
  noEliminate: Set<RuleId> | "all"
  allowIncrease: Set<RuleId> | "all"
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
        e.message += `\n  in seatbelt file "${filename}"`
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
    let changed = false
    const maxErrors = this.getMaxErrors(filename) ?? new Map()

    ruleToErrorCount.forEach((errorCount, ruleId) => {
      const maxErrorCount = maxErrors.get(ruleId) ?? 0
      if (errorCount === maxErrorCount) {
        return
      }

      if (
        args.allowIncrease === "all" ||
        args.allowIncrease.has(ruleId) ||
        errorCount < maxErrorCount
      ) {
        maxErrors.set(ruleId, errorCount)
        changed = true
      }
    })

    if (args.noEliminate !== "all") {
      const noEliminateSet = args.noEliminate
      maxErrors.forEach((maxErrorCount, ruleId) => {
        if (noEliminateSet.has(ruleId)) {
          return
        }

        if (!ruleToErrorCount.has(ruleId)) {
          return
        }

        maxErrors.delete(ruleId)
        changed = true
      })
    }

    if (changed) {
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
    }
  }

  writeSync() {
    const dataString = this.toDataString()
    const destination = this.filename
    const tempFile = `${destination}.tmp${process.pid}`
    fs.writeFileSync(tempFile, dataString)
    fs.renameSync(tempFile, destination)
  }
}

function parseMaxErrors(lines: SeatbeltStateFileLine[]): Map<RuleId, number> {
  const maxErrors = new Map<RuleId, number>()
  lines.forEach((line) => {
    maxErrors.set(line.ruleId, line.maxErrors)
  })
  return maxErrors
}
