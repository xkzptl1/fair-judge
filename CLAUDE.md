## What this product is  
  
This is a multi-perspective news exploration app.  
  
It helps users understand how the same topic is framed differently across media sources.  
  
This is NOT a traditional news feed.  
  
---  
  
## Core Principles  
  
- Show topics, not articles  
- Prioritize understanding before reading  
- Visualize disagreement across sources  
- Highlight ambiguity instead of hiding it  
  
---  
  
## UX Rules  
  
- Users must understand the topic before reading articles  
- Always show stance distribution at the top  
- Do not force binary interpretation  
- Allow "unclear" as a valid state  
  
---  
  
## Anti-Goals  
  
- Do not become a scrolling-based news feed  
- Do not optimize for clicks or engagement  
- Do not oversimplify complex topics  
- Do not hide conflicting viewpoints}

## Language Constraint

- Primary language is Japanese
- All UI must be in Japanese
- Article summaries must be in Japanese
- Classification output must be in Japanese
- Even when source articles are in English, outputs must be localized into natural Japanese

---

## Operational Output Rules

- For checklists, audits, and observational reports: give the **compressed operational version first** by default
- Only provide the full audit/detail version when explicitly asked
- Prioritize high-signal observations over exhaustive coverage

## Pattern Tracking

- Across observation runs, continuously separate:
  - **One-off anomalies** — single-run occurrences with no recurrence evidence
  - **Recurring structural patterns** — observed in ≥2 independent runs
- When reporting observations, always label each finding as one-off or recurring
