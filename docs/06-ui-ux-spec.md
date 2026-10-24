# 06. UI/UX Specification: Investigation Console

## 1. Design principles

1. **Answer first.** The first screen of an investigation shows the verdict and the Point of No Return, not raw logs.
2. **Evidence one click away.** Every claim links to its step and ledger entry.
3. **Calm and precise.** Investigators work under pressure; use restrained color, clear hierarchy.
4. **Keyboard friendly.** Step navigation and review actions have shortcuts.
5. **Original look and feel.** Do not imitate any existing vendor product (doc 15).

## 2. Visual identity (original direction)

| Element | Direction |
|---|---|
| Concept | Flight recorder: dark instrument-panel feel, with a light theme |
| Palette | Graphite neutrals, signal amber for the Point of No Return, teal for verified/clean, red reserved for critical violations |
| Typography | Sans for UI, monospace for trace content |
| Iconography | Custom simple line icons: recorder tape, marker flag, ledger |
| Motif | Horizontal "tape" timeline with a flag at the PNR |
| Logo | Create from scratch (a stylized recorder reel or box with a marker); no reuse of any third-party mark |

Color must never be the only signal (NFR-010): pair color with icon and label.

## 3. Information architecture

```
Home (Dashboard)
├─ Projects
│   └─ Project
│       ├─ Investigations (list)
│       │   └─ Investigation detail  ← core screen
│       ├─ Records (uploaded runs)
│       ├─ Rulebooks
│       │   ├─ Editor with lint panel
│       │   └─ Versions and benchmark results
│       ├─ Benchmarks
│       └─ Settings (API keys, redaction, retention, members)
├─ Review queue
└─ Admin (users, audit log)
```

## 4. Key screens

### 4.1 Dashboard

- Cards: investigations this week, median time to verdict, top categories (bar), open reviews.
- Table: latest investigations with status chips.

### 4.2 Upload and quick start

- Drag-and-drop zone, format auto-detect, project and rulebook selectors.
- "Try a sample run" button loads a bundled example (supports NFR-009).
- Inline validation errors with path and message.

### 4.3 Investigation detail (core)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: run title · project · rulebook vX · status · [Export ▾]      │
├──────────────────────────────────────────────────────────────────────┤
│ VERDICT BAR                                                          │
│  ⚑ Point of No Return: Step 3   Category: BB-POL Policy Breach       │
│  Confidence 0.86 · Basis: rules+model · [Accept] [Correct] [Reject]  │
├───────────────────────────────┬──────────────────────────────────────┤
│ TIMELINE (tape)               │ STEP INSPECTOR                       │
│ 0 ○ user message              │ Step 3 · agent-1 · tool_call         │
│ 1 ○ tool_call get_order       │ Raw content / Normalized fields tabs │
│ 2 ○ tool_result               │ Arguments, result, timestamps        │
│ 3 ⚑ tool_call cancel_order ▲  │                                      │
│ 4 ○ ... (downstream faded)    │ EVIDENCE for this step               │
│                               │  • POL-NO-CANCEL-SHIPPED (critical)  │
│ Filters: violations only,     │    observed / expected / excerpt     │
│ actor, kind                   │    [Open rule]                       │
├───────────────────────────────┴──────────────────────────────────────┤
│ LEDGER TABLE (sortable): seq · step · check · severity · category    │
├──────────────────────────────────────────────────────────────────────┤
│ REASONING: short model explanation with ledger citations (links)     │
│ CONFLICTS: shown only if rules and model disagree                    │
└──────────────────────────────────────────────────────────────────────┘
```

**Behaviors**
- Clicking a step highlights its ledger entries; clicking a ledger entry scrolls the timeline.
- Steps after the PNR are visually muted, with a toggle "show downstream".
- Violation markers: shape plus color (circle info, triangle major, filled flag critical).
- Multi-agent runs: swimlanes per agent, handoffs drawn as connectors.
- Keyboard: `j/k` next/prev step, `v` next violation, `p` jump to PNR, `a/c/r` review actions.

### 4.4 Review dialog

- Choose decision: accept, correct, reject.
- If correct: select PNR step (pick from timeline) and primary category, add note.
- Shows what will be saved and that it enters labeled data.

### 4.5 Rulebook editor

- Split view: YAML editor (syntax highlight) and live lint panel.
- Check outline sidebar; clicking jumps to the check.
- "Test on trace" runs the draft against a chosen record and shows resulting ledger without saving.
- Version history with diff and "benchmark this version".

### 4.6 Benchmark results

- Table of runs: rulebook version, accuracy metrics, delta vs. baseline.
- Confusion matrix for categories; list of misses linking to investigations.

### 4.7 Report preview

- HTML preview of the exported report with integrity footer.

## 5. States and edge cases

| State | Treatment |
|---|---|
| Queued/running | Progress by stage (Normalize, Scan, Locate, Adjudicate, Reconcile) |
| Failed | Clear reason, "Rerun" action, link to logs for admins |
| No violations found | Message: "No rule violations. The rulebook may not cover this failure." with "Request model-only analysis" |
| Model-only verdict | Amber banner "Lower confidence: not backed by rule evidence" |
| Very long trace | Virtualized timeline, step search |
| Redacted content | Placeholders styled distinctly (for example `⟦EMAIL_1⟧`) |
| Empty states | Guidance and sample data link |

## 6. Accessibility (WCAG 2.1 AA)

- Contrast ratios met in both themes.
- All interactive elements keyboard reachable with visible focus.
- Timeline exposes an accessible list alternative with ARIA labels per step.
- No information by color alone.
- Respect reduced-motion settings.

## 7. Content and microcopy guidelines

- Use plain language: "The agent cancelled an order that had already shipped."
- Show IDs but lead with meaning.
- Errors say what happened and what to do next.
- Avoid blame wording; describe behavior and evidence.

## 8. Responsive behavior

- Desktop-first. Tablet: inspector becomes a drawer. Mobile: read-only verdict and timeline view (review actions optional).

## 9. Frontend architecture notes

- React + TypeScript + Vite; TanStack Query for server state; Zustand for UI state.
- Components: `Timeline`, `StepInspector`, `EvidencePanel`, `VerdictBar`, `LedgerTable`, `RulebookEditor`, `ReviewDialog`.
- Timeline rendered with SVG and virtualization for large traces.
- Design tokens in a single theme file; Storybook for components.
- i18n via message catalogs from day one.

## 10. UX acceptance checklist

- [ ] Verdict visible without scrolling on a 1366×768 screen.
- [ ] Any ledger entry reachable from its step in one click.
- [ ] First-time user completes sample investigation in under 10 minutes.
- [ ] Axe accessibility scan has zero critical issues.
- [ ] Usability test with 5 users, 80% complete core task unaided.

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Initial version |
