# rules-md-builder

Work in progress.

This will build markdown for the FedRAMP Consolidated Rules from fedramp-consolidated-rules.json in https://github.com/FedRAMP/rules.

This repository tracks `FedRAMP/rules` as a git submodule at `rules` so the source material stays owned upstream instead of being edited here.

The `rules` submodule is configured with sparse checkout so only `fedramp-consolidated-rules.json` is materialized in the working tree. Git still keeps submodule metadata under `.git/modules`, but the checked-out filesystem stays focused on the one upstream file this repository needs.

To install dependencies:

```bash
bun install
```

To sync the upstream dependency locally and re-apply sparse checkout:

```bash
bun run sync:rules
```
