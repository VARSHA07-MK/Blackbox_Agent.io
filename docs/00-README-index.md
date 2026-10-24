# Blackbox for Agents: Documentation Index

> **Blackbox for Agents** is a flight-recorder and crash-investigation platform for AI agents.
> It records what an agent did, replays the run against explicit rules, and pinpoints the
> **Point of No Return**: the first step after which the run could no longer succeed.

| Field | Value |
|---|---|
| Project codename | `blackbox` |
| Product name | Blackbox for Agents |
| Owner | Accurith Technologies (founder-led) |
| Doc set version | 1.0.0 |
| Status | Draft for build kickoff |
| Last updated | 2026-10-24 |

## How to read this set

Read in order for a full onboarding, or jump to what you need.

| # | Document | Phase (SDLC) | Read it when you need to... |
|---|---|---|---|
| 01 | [Vision and Business Case](01-vision-and-business-case.md) | Initiation | Explain why the product exists, who it is for, how success is measured |
| 02 | [Requirements (SRS)](02-requirements-srs.md) | Requirements | Know exactly what to build, with acceptance criteria |
| 03 | [Architecture and Design](03-architecture-and-design.md) | Design | Understand components, flows, tech stack, key decisions (ADRs) |
| 04 | [Data Model and API](04-data-model-and-api.md) | Design | Build the database, record schema, REST API |
| 05 | [Engine Spec: Rulebook and Failure Taxonomy](05-engine-spec-rulebook-and-taxonomy.md) | Design | Implement the core diagnosis engine |
| 06 | [UI/UX Specification](06-ui-ux-spec.md) | Design | Build the investigation console |
| 07 | [Security and Compliance](07-security-and-compliance.md) | Design / Verification | Threat model, data protection, control mapping |
| 08 | [Testing Strategy](08-testing-strategy.md) | Verification | Plan unit, integration, accuracy, and security tests |
| 09 | [DevOps and Deployment](09-devops-and-deployment.md) | Deployment | CI/CD, environments, infra, observability |
| 10 | [Agile Delivery Plan](10-agile-delivery-plan.md) | Planning | Run sprints, backlog, roles, release plan |
| 11 | [Risk Register](11-risk-register.md) | Governance | Track and mitigate project and product risks |
| 12 | [Build Guide and Repo Blueprint](12-build-guide-and-repo-blueprint.md) | Implementation | Start coding on day one |
| 13 | [Operations and Maintenance Runbook](13-operations-runbook.md) | Operations | Run, monitor, back up, and support the system |
| 14 | [Future Roadmap and Extensions](14-future-roadmap.md) | Evolution | Plan beyond the MVP |
| 15 | [Glossary and Originality Guidelines](15-glossary-and-originality.md) | Governance | Keep terms consistent and the product legally distinct |

## SDLC coverage map

| SDLC phase | Where it lives |
|---|---|
| Initiation and feasibility | 01, 11 |
| Requirements | 02 |
| Design (architecture, data, UI, security) | 03, 04, 05, 06, 07 |
| Implementation | 12, 10 |
| Verification and validation | 08 |
| Deployment | 09 |
| Operations and maintenance | 13 |
| Evolution | 14 |
| Governance and IP | 11, 15 |

## Document conventions

- Requirement IDs: `FR-###` (functional), `NFR-###` (non-functional), `US-###` (user story).
- Architecture decisions: `ADR-###` in doc 03.
- Risk IDs: `R-##` in doc 11.
- Diagrams use Mermaid so they render in GitHub, GitLab, and most Markdown viewers.
- Every doc has a **Change log** at the bottom. Update it with every material change.

## Guiding principles (apply to every doc)

1. **Evidence before opinion.** Deterministic checks produce evidence; the language model only reasons over that evidence.
2. **Auditable by default.** Every verdict can be traced to rule, step, and data.
3. **Domain-agnostic core.** Domain knowledge lives in rulebooks, not in engine code.
4. **Treat traces as hostile input.** A recorded agent run can contain prompt injection or sensitive data.
5. **Original design.** This product is independently designed. See doc 15.

## Change log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0.0 | 2026-10-24 | Accurith | Initial documentation set |
