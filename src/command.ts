#!/usr/bin/env -S pnpm exec tsx
// TODO: useful command

import { logStderr } from "./SeatbeltConfig"

function main() {
  logStderr("command not implemented")
  process.exit(1)
}

if (require.main === module) {
  main()
}
