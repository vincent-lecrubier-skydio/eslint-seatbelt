import fs from "node:fs"
import nodePath from "node:path"

function findAncestorDirectory(
  path: string,
  predicate: (dir: string) => boolean,
) {
  let lastPath = undefined
  while (path !== lastPath) {
    if (predicate(path)) {
      return path
    }
    lastPath = path
    path = nodePath.dirname(path)
  }
}

function isGitRoot(dir: string) {
  return fs.existsSync(nodePath.join(dir, ".git"))
}

export function findRepoRoot(path: string) {
  return findAncestorDirectory(path, isGitRoot)
}

const GIT_ACTION_FILES = [
  // git add, etc
  "index.lock",
  "index.temp",
  // git rebase
  // https://stackoverflow.com/questions/3921409/how-to-know-if-there-is-a-git-rebase-in-progress/67245016#67245016
  "rebase-apply",
  "rebase-merge",
  // git merge
  // https://stackoverflow.com/questions/30733415/how-to-determine-if-git-merge-is-in-process
  "MERGE_HEAD",
]

export function isGitActionInProgress(dir: string) {
  if (!isGitRoot(dir)) {
    return false
  }
  return GIT_ACTION_FILES.some((file) =>
    fs.existsSync(nodePath.join(dir, ".git", file)),
  )
}
