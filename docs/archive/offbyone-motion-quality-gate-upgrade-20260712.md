# OffByOne Motion Quality Gate Upgrade Archive

Archived: 2026-07-12 23:16:18 CST

## Summary

This upgrade absorbed the interaction/motion craft principles distilled from `emilkowalski/skills` into OffByOne as a native Motion Quality Gate, then promoted that gate from advisory guidance to an actual release-quality blocker in `project-doctor`.

Final verdict: **PASS — upgraded, committed, and verified with real-model generation QA.**

## Commits

- `6fe4eef Add OffByOne motion quality gate`
  - Added OffByOne-native motion quality rules, tokens, guidance, and initial supervisor evidence.
- `16a3901 Promote motion quality gate to release gate`
  - Promoted Motion Quality Gate into project-doctor release gating.
  - Expanded scanner coverage and Tailwind anti-pattern detection.
  - Added recovery prompt motion rules and regression coverage.

Current branch state at archive time:

```text
main...origin/main [ahead 2]
```

## Upgrade Scope

### 1. Native Motion Quality Gate

Added OffByOne-native motion guidance based on abstract interaction-design principles:

- no `transition-all` / `transition: all`
- no `ease-in` for UI entry/interaction timing
- no `scale(0)`, `scale-0`, `scale-y-0`, `scale-x-0`, or `zoom-in-0` entrances
- no routine UI motion over 300ms
- no layout-property transitions such as height/max-height/width/top/left
- require reduced-motion handling when movement is present

Key file:

```text
src/design/motionQuality.js
```

### 2. Real Release Gate Integration

`project-doctor` now runs product/design supervision as a release stage and records:

- `productQualityOk`
- `motionQualityOk`
- product quality score/grade/status
- motion red flag count and findings

Motion findings now block release instead of only reducing an advisory score.

Key file:

```text
src/agent/projectDoctor.js
```

### 3. Scanner Coverage Expansion

Supervisor source reading now covers:

- nested `src/pages/**`
- nested `src/components/**`
- `src/styles/**`
- `src/index.css`
- `src/App.css`
- `src/styles/theme.css`

Key file:

```text
src/supervisor/projectReader.js
```

### 4. Recovery Path Protection

Compact/recovery prompts now carry hard motion rules, so long-prompt gateway recovery cannot bypass Motion Quality Gate guidance.

Key files:

```text
src/generators/pageGenerator.js
src/generators/layoutGenerator.js
```

### 5. Regression Tests

Added tests for:

- Tailwind motion anti-patterns
- CSS/nested component scanner coverage
- page/layout recovery prompt motion rules
- `project-doctor` passing clean motion
- `project-doctor` blocking bad motion even when technical gates pass

Key file:

```text
scripts/check.js
```

## Review Evidence

Dual review reports were produced before the release-gate fix:

```text
outputs/reports/offbyone_codex_qa_review.md
outputs/reports/offbyone_opencode_review.md
outputs/reports/offbyone_joint_code_review_summary.md
```

Joint review verdict before fix: **Block** — Motion Quality Gate was advisory, scanner coverage was incomplete, Tailwind cases were missed, and recovery prompts could bypass rules.

This upgrade resolves those blockers.

## Verification

### Local Regression

Commands run after the fix:

```text
npm run check
npm run runtime-smoke
npm run runtime-cli-smoke
npm run workbench-smoke
```

Result:

```text
PASS
```

### File-Level Gate Verification

A temporary project was checked with real supervisor/project-doctor paths:

```text
GOOD pass pass pass 91
BAD fail fail fail transition_all,ease_in_ui,scale_zero,missing_reduced_motion
```

Meaning:

- clean motion passes release gate
- bad motion blocks release gate

## Real Model QA

Real provider preflight passed against Ainaiba OpenAI-compatible gateway:

```text
provider: openai
model: gpt-5.5
baseUrlHost: api.ainaibahub.com
credential: OPENAI_API_KEY present=true
```

No API key was printed or archived.

Generated QA project:

```text
generated/qa-real-release-motion-gate-20260712-224102
```

Prompt summary:

```text
LedgerPulse — trust-data infrastructure SaaS for fintech risk teams.
```

Generation notes:

- `chat`: real model completed
- `analysis`: real model completed
- `layout`: real model completed
- `page Home`: real model completed through compact page recovery
- `db/plan/backend/app`: local fallback where Ainaiba long prompts returned 504

Gateway issue observed:

```text
504 Gateway Time-out on long db/plan/page prompts
```

This did not block final QA because recovery preserved real-model layout/page coverage.

### Real QA Gates

Commands run against the generated project:

```text
node src/cli.js validate --output generated/qa-real-release-motion-gate-20260712-224102
node src/cli.js supervise --output generated/qa-real-release-motion-gate-20260712-224102
node src/cli.js build-check --output generated/qa-real-release-motion-gate-20260712-224102 --install
node src/cli.js project-doctor --output generated/qa-real-release-motion-gate-20260712-224102 --install --save-baseline
node src/cli.js acceptance-check --output generated/qa-real-release-motion-gate-20260712-224102
node src/cli.js visual-check --output generated/qa-real-release-motion-gate-20260712-224102
```

Results:

```text
validate: PASS
supervise: PASS
build-check: PASS
project-doctor: PASS
acceptance-check: PASS
visual-check: PASS
```

Key release fields:

```text
Release Gate: PASS
Readiness: A / 100
Product Quality: B / 85
Product Review Status: ready
Motion Gate: PASS
Motion red flags: 0
```

Visual evidence:

```text
generated/qa-real-release-motion-gate-20260712-224102/.agent/visual/desktop.png
generated/qa-real-release-motion-gate-20260712-224102/.agent/visual/mobile.png
```

Primary QA reports:

```text
generated/qa-real-release-motion-gate-20260712-224102/.agent/project-doctor/report.json
generated/qa-real-release-motion-gate-20260712-224102/.agent/project-doctor/report.md
generated/qa-real-release-motion-gate-20260712-224102/.agent/supervisor/product-review.json
generated/qa-real-release-motion-gate-20260712-224102/.agent/acceptance/report.json
generated/qa-real-release-motion-gate-20260712-224102/.agent/visual/report.json
```

## Changed Files

```text
src/design/motionQuality.js
src/supervisor/designHeuristics.js
src/supervisor/projectReader.js
src/agent/projectDoctor.js
src/generators/pageGenerator.js
src/generators/layoutGenerator.js
scripts/check.js
README.md
```

## Final Status

OffByOne now treats motion/interaction quality as a real publish gate:

- generation guidance includes motion rules
- recovery paths include motion rules
- scanner sees generated CSS and nested components
- Tailwind motion anti-patterns are detected
- `project-doctor` blocks release on motion findings
- real-model website generation still passes with zero motion red flags

Final archive verdict: **upgrade complete and release-gate verified.**
