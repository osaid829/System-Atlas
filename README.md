# System Atlas

> A local-first architecture observatory for JavaScript and TypeScript codebases.

System Atlas turns a repository into an interactive map of directories, files, symbols, imports, external packages, and dependency threads. Start with a pasted directory tree for a fast structural overview, or upload source files for AST-based dependency analysis.

Repository: <https://github.com/osaid829/System-Atlas>

## Status

System Atlas is currently a **public beta foundation**. The core flow is complete and deployable as a static web application. The parser and graph model are intentionally conservative: unresolved relationships are reported as diagnostics instead of being silently guessed.

## Features

- Local directory-tree parsing for instant structure maps.
- Browser-based folder upload for JavaScript and TypeScript projects.
- AST-based file, symbol, import, export, and package indexing.
- Relative import resolution and external package nodes.
- Search across files, functions, symbols, and packages.
- Dependency and dependent inspection for selected entities.
- One-, two-, and three-hop focus exploration.
- Stable 2D orthographic and 3D perspective graph views.
- Directory clusters, file nodes, package nodes, and relationship edges.
- Entity inspector with relationships, symbols, metrics, and diagnostics.
- Parser execution inside a Web Worker so the main interface stays responsive.
- WebGL capability detection with an accessible entity-index fallback.
- Active project naming and a current-session successful-upload counter.
- Local-only processing with no application backend or account requirement.

## Requirements

- Node.js `20.19+` or `22.12+`.
- A modern browser with JavaScript enabled.
- Chrome or Safari recommended for the interactive 2D/3D scene.

## Quick start

```bash
git clone https://github.com/osaid829/System-Atlas.git
cd System-Atlas
npm install
npm run dev
```

Open the local URL printed by Vite. The app starts with a labeled sample repository so the graph can be explored immediately.

## How to use it

1. **Load sample** to explore the built-in architecture fixture.
2. **Paste a directory tree** and choose **Scan tree** for a structure-only map.
3. **Upload project** to scan JavaScript and TypeScript source files locally.
4. Search for a file, function, symbol, or package in **Find a thread**.
5. Select an entity to inspect its dependencies, dependents, symbols, and diagnostics.
6. Adjust focus depth, directory/package visibility, or switch between 2D and 3D.

### Input behavior

- Supported source extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, and `.cjs`.
- Directory names are inferred from the browser-provided relative file path.
- A single loose file uses its filename as the project name.
- Pasted trees use their first non-empty line as the project name.
- Ignored path segments include `.git`, `.next`, `.turbo`, `build`, `coverage`, `dist`, `node_modules`, `out`, and `vendor`.

## Product model

### Structure-only mode

A pasted directory tree provides hierarchy but cannot prove imports, exports, or function calls. System Atlas labels this view `STRUCTURE ONLY` and keeps the result intentionally lightweight.

### Dependency-scan mode

An uploaded source set enables `DEPENDENCY SCAN`. The parser extracts files, directories, symbols, imports, external packages, and best-effort call relationships. Unresolved imports remain visible as diagnostics.

## Privacy and security

- Source files are parsed in the browser and are not sent to a System Atlas backend.
- The app does not require authentication, an API key, a database, or environment variables.
- Only the upload counter is stored in `sessionStorage`; source contents are not persisted by the app.
- Serve public deployments over HTTPS and configure your static host with a restrictive Content Security Policy and `frame-ancestors` policy.
- Only select repositories you intend to analyze. The browser directory picker can expose selected file contents to the page before parser-level extension and ignore filtering is applied.
- Do not host an untrusted or modified build under a trusted origin where it could receive sensitive local file selections.

## Development commands

```bash
npm run dev          # start the Vite development server
npm run typecheck    # run the TypeScript project checks
npm run lint         # run Oxlint
npm test             # run the Vitest suite
npm run build        # create the production bundle in dist/
npm run check        # typecheck, lint, test, and build in sequence
```

Security and dependency audit:

```bash
npm audit --audit-level=low
```

## Deployment

System Atlas is a static Vite application. Build it and publish the generated `dist/` directory to a static host such as GitHub Pages, Netlify, Vercel, Cloudflare Pages, or an equivalent HTTPS service.

```bash
npm ci
npm run check
npm run build
npm run preview
```

The Vite configuration uses relative asset paths (`base: './'`) so the generated bundle can be served from a project subpath. Before calling a deployment production-ready, verify:

- HTTPS is enabled.
- The deployed JavaScript, CSS, worker, and favicon assets load successfully.
- Folder upload works for a representative repository.
- Search, selection, focus depth, and 2D/3D switching remain stable.
- The accessible entity index appears when WebGL is unavailable.
- Large repositories are tested against the host's browser and resource limits.

## Architecture

- `src/domain` — graph types, metrics, and traversal queries.
- `src/ingest` — tree parsing, TypeScript AST parsing, ignore rules, project naming, and worker communication.
- `src/layout` — deterministic D3 force layout with camera-fitting bounds.
- `src/scene` — React Three Fiber scene, native line rendering, stable DOM labels, and WebGL fallback support.
- `src/fixtures` — clearly labeled sample repository data.
- `src/App.tsx` — workbench layout, ingestion controls, search, inspector, and session state.

## Known limitations

- `tsconfig.json` path aliases are not fully resolved.
- Complex package export maps are not fully resolved.
- Function call links are heuristic and should be treated as signals, not proof.
- Large source sets can consume significant browser memory and CPU; input size limits and cancellation are planned.
- The parser worker and Three.js scene produce large production chunks.
- Browser-level automated smoke tests are not yet included.

## Roadmap

1. Add path-alias resolution from `tsconfig.json`.
2. Add input limits, cancellation, and progress reporting for large repositories.
3. Add impact analysis and cycle detection.
4. Add browser-level smoke tests.
5. Add GitHub repository import.
6. Add fixture benchmarks, screenshots, and architecture decision records.

## Contributing

Keep changes focused and run the complete release check before opening a pull request:

```bash
npm run check
npm audit --audit-level=low
```

Please include a short reproduction or verification note for parser, layout, rendering, and upload-flow changes.
