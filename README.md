# eslint-seatbelt

Enable ESLint rules and prevent new errors today with a 2-file PR, then gradually fix the existing errors over time. eslint-seatbelt is designed to work like a seatbelt ratchet: it starts loose, but can only get tighter.


## Why eslint-seatbelt?

There are a few existing bulk suppression tools for ESLint and other linters, but I found 

- Most other tools store error information in hierarchical formats like JSON or YAML that make merge conflicts confusing and painful. eslint-seatbelt stores errors in TSV - tab-separated values - which minimizes (but doesn't totally eliminate) merge pain.

Some tools require complicated workflows invasive wrapper scripts, some going so far as to [monkey-patching in a replacement linter implementation](https://developers.tiktok.com/blog/bulk-suppressions-a-new-eslint-feature-for-large-codebases). eslint-seatbelt is a regular ESLint plugin ([using the processor API](https://eslint.org/docs/latest/extend/custom-processors)) so it integrates effortlessly with your editor, pre-commit hooks, and CI. It "tightens the seatbelt" by automatically reducing the allowed errors per file whenever you run `eslint` during development. In CI, state is frozen and checked for consistency with the current file error counts, so no one can forget to tighten the seatbelt.

- Many tools in this genre 

Error counts are stored in a single `eslint.seatbelt.tsv` file in a line-oriented format that minimizes (but doesn't totally eliminate) merge pain.




eslint-seatbelt tracks the allowed number of errors per file in the `eslint.seatbelt.tsv` file, and reduces the count whenever you run `eslint` after fixing an error. Pair with lint-on-save in your editor or with pre-commit hooks to fully automate the process, although its not required: in CI, `eslint` verifies the `eslint.seatbelt.tsv` file is up-to-date.

## Setup

First, install the plugin: `npm add --save-dev --save-exact eslint-seatbelt`.

Then, add the plugin to your ESLint config:

### ESLint 9+ flat config

```js
// eslint.config.js
import seatbelt from 'eslint-seatbelt'

export default [
  // Add near the top of your config object array
  seatbelt.configs.enable,
  // ... other configs
]

// Equivalent to:
export default [
  {
    plugins: { 'eslint-seatbelt': seatbelt },
    rules: { 'eslint-seatbelt/configure': 'error' },
    processor: seatbelt.processors.seatbelt,
  }
  // ... other configs
]
```

### Legacy eslintrc format

```js
// .eslintrc.js
module.exports = {
  "plugins": ["eslint-seatbelt"],
  "extends": ["plugin:eslint-seatbelt/enable-legacy"]
}

// Equivalent to:
module.exports = {
  "plugins": ["eslint-seatbelt"],
  "rules": { "eslint-seatbelt/configure": "error" },
  "processor": "eslint-seatbelt/seatbelt"
}
```

## Workflow



seatbelt views eslint rules configured entirely in "warning" mode pointless: they'll mostly be ignored and just add needless noise to everyone's editor.

### Introducing a new rule

### Configuration

No further configuration is required to get started. By default eslint-seatbelt will track errors in the `eslint.seatbelt.tsv` file in the current working directory.



## Workflow