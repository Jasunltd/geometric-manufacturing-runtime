# Documentation

This repository is organized for two audiences: a fast portfolio review and a deep technical review.

## Start here

- [Root README](../README.md) — 2–5 minute project overview.
- [FLAGSHIP.md](FLAGSHIP.md) — complete end-to-end sensor-bracket case.
- [RECOVERY.md](RECOVERY.md) — observation-driven process adaptation.
- [case-studies/README.md](case-studies/README.md) — five standalone recovery studies.

## Deep technical references

- [../ARCHITECTURE.md](../ARCHITECTURE.md) — module ownership, authority boundaries, and deep functions.
- [RESEARCH-NOTES.md](RESEARCH-NOTES.md) — current standards/toolchain research and implementation rationale.
- [../contracts/README.md](../contracts/README.md) — public semantic contracts and deep-module budgets.

## Evidence inputs

- [../examples/](../examples/) — design problems and frozen external-tool evidence used for reproducible binding.
- [../examples/recovery/](../examples/recovery/) — five open observation/recovery scenario inputs.

## Generated evidence

Run:

```bash
npm run portfolio:demo
```

to produce:

- `artifacts/sensor-bracket-v1/` — design through drawing/inspection/controller evidence;
- `artifacts/process-recovery/` — five recovery JSON/Markdown/PDF case studies.

Generated artifacts are intentionally not committed.
