# rules-md-builder

Work in progress.

This will build markdown for the FedRAMP Consolidated Rules from fedramp-consolidated-rules.json in https://github.com/FedRAMP/rules.

This repository tracks `FedRAMP/rules` as a git submodule at `rules` so the source material stays owned upstream instead of being edited here.

The `rules` submodule is configured with sparse checkout so only `fedramp-consolidated-rules.json` is materialized in the working tree. Git still keeps submodule metadata under `.git/modules`, but the checked-out filesystem stays focused on the one upstream file this repository needs.

To install dependencies:

```bash
bun install
```

To sync the upstream rules submodule locally and re-apply sparse checkout:

```bash
bun run sync
```

To generate markdown into `output/`:

```bash
bun run build
```

To build the markdown and launch a local Zensical preview server for visual review:

```bash
bun run dev
```

This uses [zensical.toml](/Users/pwx/github/pete-gov/rules-md-builder/zensical.toml:1) to serve the generated files directly from `output/`. The build also creates `output/index.md` as a lightweight preview landing page for local review.

While `bun run dev` is running, it watches:

- `templates/**/*.hbs`
- [scripts/build-markdown.ts](/Users/pwx/github/pete-gov/rules-md-builder/scripts/build-markdown.ts:1)

When either changes, it automatically reruns the markdown build so the Zensical preview stays up to date as you edit the template files. The main shared template now lives at [templates/template.hbs](/Users/pwx/github/pete-gov/rules-md-builder/templates/template.hbs:1).

To verify the source JSON exists and all expected markdown files are generated:

```bash
bun run test
```
