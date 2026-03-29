## Phase 1: Project Setup

- [x] Initialize Next.js project using App Router
- [x] Enable PWA support (service worker, manifest)
- [x] Setup Supabase project
- [x] Create base folder structure:
  - [x] /components
  - [x] /lib
  - [x] /types
  - [x] /app
  
  ## Phase 1.5: Database Schema

- [x] Create `supabase/schema.sql`
- [x] Add `topics` table
- [x] Add `sources` table
- [x] Add `articles` table
- [x] Add `article_classifications` table
- [x] Add `fact_checks` table
- [x] Add foreign key relationships
- [x] Add stance constraint
- [x] Add helpful indexes
- [x] Add `updated_at` trigger for `topics`
 
--- 
 
## Phase 2: Topic List (Home Screen)

- [x] Create Topic type definition
- [x] Build TopicCard component with:
  - [x] title
  - [x] article count
  - [x] source count
  - [x] last updated
  - [x] stance distribution (numbers only for now)

- [x] Build TopicList page
- [x] Render multiple TopicCards 
 
--- 
 
## Phase 3: Topic Detail Page

- [x] Create dynamic route: /topic/[id]
- [x] Build TopicHeader component
- [x] Build StanceDistribution component:
  - [x] support
  - [x] challenge
  - [x] report
  - [x] unclear

- [x] Add simple visual bar (no design polish yet) 
 
--- 
 
## Category Filter (home screen)

- [x] Add `category` column to `topics` schema (with CHECK constraint)
- [x] Create `supabase/add_category.sql` migration
- [x] Update seed data with category values
- [x] Add `category` to `TopicSummary` type
- [x] Build `TopicListWithFilter` client component
- [x] Add category badge to `TopicCard`
- [x] Only show categories with active topics

---

## Phase 4: Article List

- [x] Create Article type definition
- [x] Build ArticleCard component:
  - [x] source
  - [x] headline
  - [x] summary
  - [x] stance (via StanceTabs)
  - [x] reason (displayed as 分類の根拠：)

- [x] Render grouped articles by stance
- [x] StanceTabs with count badges per stance
- [x] Inactive tab contrast (text-slate-300)
- [x] TopicCard summary clamped to 2 lines (line-clamp-2)
 
--- 
 
## Phase 6: Discovery Pipeline

- [x] Fetch articles (multi-locale: ja, en-US, en-GB)
- [x] Normalize entities (cross-locale mapping)
- [x] Cluster articles into candidate topics
- [x] Compute scoring (cross-locale, diversity, volume, coherence)
- [x] Apply hard gates (articles, media, freshness, duplicate placeholder)
- [x] Store candidates in Supabase (candidate_topics)

---

## Phase 7: Enrichment Layer

- [x] Integrate LLM (OpenAI / Anthropic switchable)
- [x] Generate:
  - [x] refined_title
  - [x] summary
  - [x] main_issues
  - [x] category
- [x] Implement duplicate check (entity overlap vs topics)
- [x] Store in promotion_snapshot

---

## Phase 8: Review Surface

- [x] Build internal UI (/admin/candidates)
- [x] Display:
  - [x] score
  - [x] locales
  - [x] article count
  - [x] category
  - [x] summary
  - [x] main_issues
  - [x] gate results
- [x] Keep read-only (no promotion actions)

---

## Phase 8.5: Observation & Evaluation Layer

- [ ] Define observation agent
- [ ] Run evaluation (3–5 times)
- [ ] Identify patterns:
  - [ ] gate failures
  - [ ] score distribution
  - [ ] enrichment gaps
  - [ ] overlap patterns
  - [ ] signal vs noise
- [ ] Interpret observations
- [ ] Map to future decision areas

### Observation Coverage Expansion

- [ ] Ensure promoted discovered topics can ingest articles
- [ ] Verify promoted topics are observable in the same way as config-defined topics
- [ ] Confirm article_count, source_count, and stance distribution populate correctly
- [ ] Use the enriched + ingested promoted topic as an observation target before Phase 9

---

## Phase 9: Promotion Decision (Planned)

- [ ] Define promotion criteria
- [ ] Define rejection criteria
- [ ] Define deduplication rules
- [ ] Decide manual vs auto promotion
- [ ] Keep implementation separate

---

## Phase 10+: Future Improvements (Later)

- [ ] Inter-candidate deduplication
- [ ] Cluster merging / hierarchy
- [ ] Entity extraction improvements
- [ ] Stale data cleanup
- [ ] Auto-promotion (optional)
