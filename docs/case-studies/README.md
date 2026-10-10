# Process-recovery case studies

> Navigation: [portfolio overview](../../README.md) · [recovery overview](../RECOVERY.md) · [documentation map](../README.md)

These five case studies exercise one shared observation → diagnosis → admitted action → verification runtime against the flagship manufacturing plan.

All observations are deterministic simulated evidence. The point is to demonstrate the decision structure and the intake boundary for future machine feedback, metrology systems, and human corrections—not to claim physical shop-floor experience.

- [Bore Drift Before Scrap](bore-tool-wear-drift.md) — machine dimensional trend → bounded finish-bore diameter correction → remeasurement.
- [Clamp Load Bows Datum A](clamp-induced-distortion.md) — metrology + human setup correction → clamp-force reduction → remeasurement.
- [Chatter Traced to Actual Tool Stickout](chatter-excessive-stickout.md) — machine vibration + human stickout correction → shorten tool → vibration verification.
- [Bad Measurement System Blocks Compensation](gage-rr-failure.md) — failed GR&R → gauge quarantine/process hold → measurement-system requalification; no machining compensation is allowed.
- [Thermal Bias Corrected from In-Process Feedback](thermal-drift.md) — machine/metrology thermal observation → bounded work-offset correction → residual-bias verification.

The committed Markdown files are generated from the executable JSON scenarios under `examples/recovery/`; tests compare them byte-for-byte to prevent documentation drift.

Run:

```bash
npm run recovery:demo
```

to generate the five standalone JSON/Markdown/PDF reports under `artifacts/process-recovery/`.