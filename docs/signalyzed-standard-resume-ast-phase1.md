# Signalyzed Standard™ — Canonical Resume AST (Phase 1)

**Initiative 002 · Sprint 1 · Infrastructure only**

## Overview

Phase 1 introduces a canonical **Resume AST** as the single source of truth for resume structure inside Signalyz. The module lives at `supabase/functions/_shared/resumeAst/` and is shared between edge functions and Vitest via the `@signalyz/resumeAst` alias.

This sprint deliberately does **not** wire the AST into production pipelines, UI, scoring, calibration, or export. A feature flag (`isResumeAstEnabled`) defaults to `false`.

## Architecture

```mermaid
flowchart LR
  RawText[Plain-text resume] --> Normalizer[normalizer.ts]
  Normalizer --> Parser[parser.ts]
  Parser --> AST[ResumeAst]
  AST --> Validator[validator.ts]
  AST --> Fingerprints[fingerprint.ts]
  AST --> Serializer[serializer.ts]
  AST --> Observability[observability.ts]
  Validator --> Diagnostics[ValidationDiagnostic[]]
  Fingerprints --> Metadata[metadata.fingerprint]
  Observability --> Summary[Counts + fingerprint only]
```

### Module responsibilities

| Module | Role |
|--------|------|
| `types.ts` | Canonical AST interfaces (`ResumeAst`, `AstBullet`, section entries) |
| `parser.ts` | Parse existing plain text into structured objects — **no generation** |
| `normalizer.ts` | Whitespace, bullet symbols, section names, unicode, hyperlinks |
| `validator.ts` | Structural diagnostics only — **never mutates** |
| `fingerprint.ts` | Deterministic FNV-1a fingerprints for resume, section, bullet |
| `serializer.ts` | AST → plain text for round-trip fidelity |
| `observability.ts` | Sanitized metrics — no resume text or PII |
| `textUtils.ts` | Shared regex, section aliases, signal extraction |
| `index.ts` | Public API + `isResumeAstEnabled` feature flag |

### AST shape

The document model mirrors how recruiters read resumes:

- **Metadata** — parse version, line count, document fingerprint
- **Header** — name, contact, `rawLines` for lossless header preservation
- **ProfessionalSummary** — prose + bullets
- **Experience[]** — role headers + rich bullets
- **Projects[], Education[], Skills[], Certifications[], Links[], Awards[], CustomSections[]**
- **bullets[]** — flat index of every bullet in document order

Each bullet is a first-class object:

```ts
{
  id, source, role, company, section, text,
  metrics, technologies, ownershipSignals, aiSignals, leadershipSignals,
  confidence, fingerprint?
}
```

Signal arrays are **extracted from existing text** (regex/heuristics), not invented.

## Extension points

1. **Parser adapters** — Add `sourceFormat: "docx" | "pdf"` parsers that emit the same `ResumeAst` without changing downstream consumers.
2. **Validator plugins** — Append domain-specific diagnostics (e.g. industry chronology rules) via `mergeDiagnostics`.
3. **Normalizer profiles** — `normalizeResumeAst(ast, { profile: "strict" | "ats" })` for export-specific formatting without touching source AST.
4. **Fingerprint scopes** — Section and bullet fingerprints enable incremental diff; resume fingerprint enables identity across re-parses.
5. **Observability sinks** — `logResumeAstObservability` is console-only today; can fan out to Supabase shadow tables behind a flag.

## Future integrations

### Resume QA Engine

Today QA operates on section strings. With the AST:

- Cross-section contamination checks become graph walks on `AstBullet.source` and `section`.
- Bullet-level confidence gates align with QA severity without re-parsing.
- Validator diagnostics can seed QA warnings before LLM review.

### Export Engine

Export today reassembles text. With the AST:

- DOCX/PDF renderers traverse typed sections instead of re-detecting headers.
- Bullet identity (`id`, `fingerprint`) preserves user edits across export rounds.
- Normalizer profiles produce ATS-safe output without mutating canonical AST.

### Identity Engine

Fingerprints enable:

- Stable bullet identity across calibration and optimization runs
- Diff-based regression tests (“did this bullet change meaning?”)
- Shadow observatory correlation by `resume_<hash>` without storing PII

## Complexity tradeoffs

| Choice | Benefit | Cost |
|--------|---------|------|
| Plain-text parser first | Zero migration; works with all current inputs | Imperfect structure on exotic layouts |
| Preserve `rawLines` in header | Lossless round-trip for contact blocks | Slightly larger AST |
| Flat `bullets[]` index | O(1) iteration for QA/scoring hooks | Must keep in sync on mutation (parser owns this) |
| Diagnostics-only validator | Safe to run in shadow mode | Callers must apply fixes explicitly |
| FNV-1a fingerprints | Fast, deterministic, no crypto deps | Not collision-resistant for security use cases |

## Why AST beats text-first processing

1. **Identity** — Bullets have stable IDs and fingerprints; text diffing conflates formatting with meaning.
2. **Composition** — Scoring, QA, export, and calibration consume the same structure instead of re-implementing section detection.
3. **Validation** — Structural errors (duplicate skills, broken links, chronology) are detectable before expensive LLM calls.
4. **Observability without PII** — Counts and fingerprints summarize documents safely.
5. **Evolution** — New sections and signal types extend the schema; text pipelines require fragile regex patches across N call sites.

Text-first processing optimizes for the first parse. AST-first processing optimizes for the **lifecycle** of a resume inside Signalyz.

## Usage (behind flag)

```ts
import { isResumeAstEnabled, buildResumeAstFromText } from "@signalyz/resumeAst";

if (isResumeAstEnabled(Deno.env.get("ENABLE_RESUME_AST"))) {
  const { ast, validation, observability } = buildResumeAstFromText(resumeText);
  // shadow logging only — not wired in Phase 1
}
```

## Test coverage

`src/test/resumeAst.test.ts` exercises six fixtures:

- Simple, engineering, customer success, malformed, AI engineer, two-page

Assertions: deterministic parsing, fingerprint stability, serialization round-trip, validator accuracy, zero substantive content loss.

## Phase 1 boundaries

- No UI changes
- No production pipeline wiring
- No scoring / calibration / export changes
- No deployment required
- Feature flag off by default
