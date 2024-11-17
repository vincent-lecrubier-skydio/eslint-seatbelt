import { openSync, writeSync, closeSync, constants, rmSync } from "node:fs"
import { isErrno } from "./errorHanding"
const { O_CREAT, O_EXCL, O_RDWR } = constants

const waitBuffer = new Int32Array(new SharedArrayBuffer(4))

/** Uses posix open(2) O_EXCL to implement a multi-process mutual exclusion lock. */
export class FileLock {
  private fd: number | undefined
  constructor(public readonly filename: string) {}

  tryLock() {
    this.assertNotLocked()
    try {
      this.fd = openSync(this.filename, O_CREAT | O_EXCL | O_RDWR)
      return true
    } catch (e) {
      if (isErrno(e, "EEXIST")) {
        return false
      }
      throw e
    }
  }

  waitLock(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs
    while (!this.tryLock()) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for lock on ${this.filename}`)
      }
      Atomics.wait(waitBuffer, 0, 0, 1)
    }
  }

  isLocked() {
    return this.fd !== undefined
  }

  unlock() {
    if (this.fd !== undefined) {
      closeSync(this.fd)
      rmSync(this.filename)
      this.fd = undefined
    }
  }

  assertNotLocked() {
    if (this.fd !== undefined) {
      throw new Error(
        `FileLock "${this.filename}" is already locked by this process [pid ${process.pid}]`,
      )
    }
  }
}
