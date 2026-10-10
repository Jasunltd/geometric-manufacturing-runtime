# External engineering tools, references, and licensing boundaries

This source snapshot includes independently authored design/manufacturing
semantics, test fixtures and **recorded execution receipts**. It does not
include the proprietary/open-source toolchains themselves.

## Referenced toolchains and sources

| Project or documentation | Use in this study | Separate rights and distribution |
| --- | --- | --- |
| [build123d](https://build123d.readthedocs.io/) (pinned 0.13.0; see `requirements-build123d.txt`) | Python CAD realization, geometry through OCCT | Installed independently; upstream terms govern the Python library and dependencies |
| [Open CASCADE Technology](https://dev.opencascade.org/) (OCCT) | CAD kernel used through the build123d realization | Not copied; use the exact upstream license for any separately distributed CAD kernel |
| [Gmsh](https://gmsh.info/) (recorded 4.15.2) | Discretized structural mesh preparation | Executable not included; its own distribution/license governs |
| [CalculiX](http://www.dhondt.de/) (recorded 2.23) | External structural results for the frozen sensor-bracket candidate | Executable not included; results are recorded evidence, not solver source |
| [LinuxCNC](https://linuxcnc.org/) (recorded 2.9.8) | RS274/NGC interpreter accepts the emitted LinuxCNC program | Target executable/GUI not bundled and no machine approval claimed |
| [Haas Automation](https://www.haascnc.com/service/online-operator-s-manuals/mill-operator-s-manual/mill---g-codes.html) | Haas NGC postprocessor syntax reference and target-model semantics | Third-party vendor documentation referenced, not copied; no Haas certification |
| [ReportLab](https://www.reportlab.com/opensource/) (pinned 5.0.1; `requirements-reporting.txt`) | Generated drawings and manufacturing report PDFs | External Python dependency, not bundled |
| [Effect](https://effect.website/), [XState](https://stately.ai/docs) | Typed TypeScript and lifecycle runtime dependencies; versions in `package-lock.json` | Installed by npm; each retains its own upstream license |
| [NIST Engineering Statistics Handbook](https://www.itl.nist.gov/div898/handbook/) | Measurement/capability and statistical-method reference | Public methodological reference, not a copied code dependency |
| [ASME standards catalog](https://www.asme.org/codes-standards) | Verification/design standards background | Proprietary standards texts are not redistributed |

For project-specific research links and engineering assumptions, consult
[docs/RESEARCH-NOTES.md](docs/RESEARCH-NOTES.md),
[docs/FLAGSHIP.md](docs/FLAGSHIP.md) and
[docs/RECOVERY.md](docs/RECOVERY.md).

## Files and derivative evidence

- `examples/sensor-bracket.design-problem.json` and related fixtures:
  independently constructed modeling inputs, not employer drawings.
- `examples/*.structural-analysis.recorded.json`:
  serialized observations attributed to execution using Gmsh and CalculiX;
  no original Gmsh/CalculiX source is included.
- `examples/*.linuxcnc-rs274.recorded.json` and
  `*.linuxcnc-rs274.canonical.txt`: recorded target verification, not a
  license to distribute controller software, a claim of vendor approval,
  physical CNC machining, or a grant of operational authority.
- Generated `artifacts/` outputs are gitignored, not distributed here.
  Synthetic metrology, cost scenarios and simulated recovery are identified
  as **synthetic**, not real production measurements.

The source code's root [MIT LICENSE](LICENSE) and
[LICENSE-SCOPE.md](LICENSE-SCOPE.md) apply only to original authored software
and associated original software documentation where rights are held. They
**do not relicense external toolchains, vendor-controlled materials, logos,
standards text, or third-party data**. Exact upstream terms must be checked
before redistribution of any third-party binary or recorded material outside
the reviewed files.

Source provenance and independent toolchain citations are recorded
above. Referencing an external project does not imply affiliation,
certification or endorsement. Any future redistribution of toolchain
binaries must comply with their upstream license terms.
