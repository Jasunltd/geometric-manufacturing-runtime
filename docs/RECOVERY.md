# Observation-Driven Process Recovery

The flagship design/manufacturing pipeline describes the nominal process.

This module asks the next question:

> **What should the system do when observations show that the real process no longer matches the nominal plan?**

The answer is not "let AI change the machine."

It is:

```text
observation
  ↓
typed source + evidence
  ↓
measurement trust / identifiability
  ↓
bounded diagnosis
  ↓
admitted action OR refusal
  ↓
explicit process-control state
  ↓
new observation
  ↓
verification
```

## Observation sources

All input is open until compiled.

### Machine feedback

Examples:

- in-process dimensional probe trends;
- spindle/tool vibration;
- thermal fiducial/probe bias.

### Metrology

Examples:

- clamped vs unclamped plane measurements;
- bore measurements;
- Gauge R&R evidence.

### Human corrections

Examples:

- actual loaded tool stickout differs from setup metadata;
- actual clamp load differs from the traveler/controller assumption.

Human corrections are evidence only. They cannot directly mutate process-control state.

## Process-control state

Recovery acts on a separate process state bound to the exact manufacturing plan:

- tool diameter correction;
- tool stickout;
- spindle/feed scale;
- clamp-force scale;
- thermal work-offset correction;
- measurement-system trust/quarantine;
- process hold state.

Nominal candidate geometry and drawing requirements remain unchanged.

## Evidence gates

The runtime can return:

- `action-recommended`;
- `hold-measurement-system`;
- `no-action`;
- `insufficient-evidence`.

A dimensional trend from a quarantined measurement system cannot drive compensation.

A chatter observation without independently established tool stickout can return insufficient evidence rather than inventing a cause.

## Five executable cases

| Case | Inputs | Diagnosis | Action | Verification |
| --- | --- | --- | --- | --- |
| [Bore Drift Before Scrap](case-studies/bore-tool-wear-drift.md) | machine bore trend | tool-wear drift | +0.006 mm T3 diameter correction | stable in-limit remeasurement |
| [Clamp Load Bows Datum A](case-studies/clamp-induced-distortion.md) | CMM + human clamp correction | clamp-induced distortion | clamp scale 1.20 → 0.72 | clamped flatness restored |
| [Chatter Traced to Actual Tool Stickout](case-studies/chatter-excessive-stickout.md) | accelerometer + human stickout correction | excessive stickout | T4 42 → 28 mm | chatter index restored |
| [Bad Measurement System Blocks Compensation](case-studies/gage-rr-failure.md) | failed GR&R | measurement system inadequate | quarantine gauge / hold process | follow-up GR&R restores measurement system |
| [Thermal Bias Corrected from In-Process Feedback](case-studies/thermal-drift.md) | thermal + positional feedback | thermal drift | −0.043 mm X work offset | residual bias 0.006 mm |

These are five independent scenarios, but they do not have five custom execution paths. They all call the same public functions:

```text
compileProcessObservation(s)
createProcessControlState
assessProcessException
applyRecoveryAction
verifyRecovery
```

The scenario runner exists only to compose those public semantics into reproducible portfolio evidence.

## Why the failed-GR&R case matters

It demonstrates that the system is not merely an automatic compensator.

```text
bad measurements
   ↓
failed measurement trust
   ↓
NO machining compensation
   ↓
quarantine gauge
   ↓
restore measurement system first
```

That separation is central to the architecture.

## Why human feedback matters

Real manufacturing data is often incomplete or stale.

A controller can know nominal tool data while the loaded assembly on the machine has a different stickout. A traveler can say one clamp setting while the actual setup differs.

The runtime therefore allows a human to supply corrected observations, but the human does not receive a bypass around:

- schema compilation;
- evidence checks;
- diagnosis;
- allowed-action enumeration;
- recovery verification.

## Reproduce the studies

```bash
npm run recovery:demo
```

Generated output:

```text
artifacts/process-recovery/
├── bore-tool-wear-drift.case-study.json
├── bore-tool-wear-drift.case-study.md
├── bore-tool-wear-drift.case-study.pdf
├── ...
├── thermal-drift.case-study.pdf
├── summary.json
└── MANIFEST.sha256
```

The five committed Markdown files under [case-studies/](case-studies/) are generated from the executable scenarios and checked byte-for-byte in tests.

## Claim boundary

These five disturbances are deterministic simulated observations used to exercise the actual recovery runtime.

They do not claim that the author personally encountered those exact disturbances on a physical machine.

The portfolio claim is narrower:

> The system has an explicit, testable structure for receiving heterogeneous manufacturing observations, deciding whether the evidence is trustworthy and diagnostic, applying only admitted process corrections, refusing unsafe/unsupported corrections, and requiring independent verification afterward.
