# 15. Glossary and Originality Guidelines

## Part A: Glossary

| Term | Definition |
|---|---|
| **Adapter** | Component that parses a source trace format into a Flight Record |
| **Adjudicator** | The model-assisted stage that confirms the Point of No Return and picks a root-cause category from the evidence |
| **Basis** | How a verdict was reached: `rules`, `rules+model`, or `model_only` |
| **Check** | One executable rule in a Rulebook, with guard, assertion, severity, and taxonomy code |
| **Derived check** | A check generated automatically from a tool schema |
| **Evidence Ledger** | Append-only, hash-chained list of violations and check errors for one investigation |
| **Flight Record** | The normalized representation of one agent run (steps, tools, policies, task) |
| **Foundation error** | An early violation whose output later steps depend on |
| **Guard** | Condition that decides whether a check applies to a step |
| **Assertion** | Condition that must hold when the guard is true |
| **Investigation** | One analysis of one Flight Record with one Rulebook version and taxonomy version |
| **Irreversible** | A check flag: violation cannot be undone by later steps |
| **Lineage** | Tracking where a value first appeared and where it was later used |
| **Point of No Return (PNR)** | The earliest step with an unrecoverable violation |
| **Reconciliation** | Combining rule candidates with the Adjudicator's output into the final verdict |
| **Rulebook** | Versioned YAML collection of checks for a project or domain |
| **Taxonomy** | The Blackbox set of twelve failure categories (`BB-XXX`) |
| **Trace** | Source-format log of an agent run before normalization |
| **Verdict** | The final output: PNR, category, confidence, basis, citations, reasoning |

## Part B: Originality and IP guidelines

**Purpose:** Blackbox for Agents must be an independent product. It was inspired by public research on diagnosing agent failures, but it must not copy, imitate, or trade on any third party's product, brand, or protected expression.

> This section is practical guidance, not legal advice. Have qualified IP counsel review naming, trademarks, and any reuse of third-party material before commercial launch.

### B.1 Ideas versus expression

- General **ideas** (validate agent traces against rules; locate the first unrecoverable step; use a taxonomy) are not owned by anyone and may be implemented independently.
- **Expression** (names, text, code, diagrams, datasets, UI layouts, logos) can be protected. Do not copy it.

### B.2 Mandatory rules for contributors

| Rule | Detail |
|---|---|
| Own names | Use Blackbox vocabulary: Flight Record, Rulebook, Check, Evidence Ledger, Point of No Return, Adjudicator. Do not use the names, product terms, or taglines of the inspiring research project |
| Own taxonomy | Use the twelve `BB-XXX` categories as defined here. Do not copy another project's category list or wording |
| Own schema and DSL | Flight Record schema and Rulebook YAML are defined in this doc set. Do not mirror another project's file formats or field names |
| Own pipeline design | The eight-stage pipeline and reconciliation logic are Blackbox's. Do not copy another project's diagrams or step names |
| Own UI | The investigation console follows doc 06. No imitation of another vendor's layout, iconography, or color scheme |
| Own visuals | Create the logo, icons, and diagrams from scratch. No third-party marks, no look-alike branding |
| Own words | Write documentation, prompts, and marketing in original language. Do not paste text from blog posts, papers, or repositories |
| No copied code | Do not copy code from third-party repositories into this codebase. If you adopt an open-source library, record its license and obey it |
| Dataset caution | Do not ingest, redistribute, or train on third-party datasets without confirming the license and terms. Prefer your own labeled data |
| No implied affiliation | Never state or imply endorsement, partnership, or compatibility with another company's product unless true and approved |

### B.3 Permitted use of the inspiration

- You may **cite** the research publicly as related work in documentation or papers, accurately and without implying affiliation.
- You may **study** open materials to understand concepts, then implement independently.
- If you ever decide to reuse open-source code, do it deliberately: confirm the license, keep notices, record the decision as an ADR, and have counsel review.

### B.4 Name and brand checks

Before public use of the name or logo:

1. Search trademark registries and the web in your target markets for "Blackbox" plus agent/AI terms. The word "blackbox" is common and descriptive in aviation, software testing, and AI, so distinctiveness may be limited; consider a distinctive logo and possibly a more distinctive company-owned name for the long term.
2. Check domain and package-registry availability.
3. Have counsel advise on registration strategy.

### B.5 Review checkpoints

| Checkpoint | When | Reviewer |
|---|---|---|
| Naming and branding review | Before external launch | Founder + counsel |
| Third-party dependency and license report | Each release (CI-generated) | Tech lead |
| Content originality review (docs, prompts, UI copy) | Each release | BA + PO |
| Dataset provenance review | Before adding any external dataset | PO + counsel |

### B.6 Provenance log (maintain)

Keep `docs/provenance.md` with a dated list of: external sources consulted, libraries adopted (with license), datasets used (with license), and design decisions that deliberately diverge from related work. This protects the team if originality is ever questioned.

## Part C: Document control

| Item | Practice |
|---|---|
| Ownership | Product Owner owns the doc set; each doc has a named maintainer |
| Updates | Same PR as the change that makes it stale |
| Versioning | Semantic version per doc, change log at bottom |
| Review | Quarterly review of all docs; ADRs reviewed when their trigger conditions occur |
| Storage | `docs/` in the repo; published to an internal site if desired |

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
