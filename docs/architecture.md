# Architecture Overview

## Frontend

- Next.js with App Router
- PWA support
- Mobile-first UI
- Topic-first information architecture

---

## Backend

- Supabase for database
- Supabase for optional auth later
- Route handlers or server functions for aggregation and processing

---

## Data Sources

Primary:
- GDELT

Optional supplements:
- News API
- Google Fact Check API

---

## Core Data Model

Main entities:

- topics
- sources
- articles
- article_classifications
- fact_checks

Important relationship model:

- one topic has many articles
- one source has many articles
- one article can have one or more classifications over time
- one topic can have multiple fact-check references

---

## Processing Pipeline

1. Fetch raw articles from external source
2. Normalize article fields
3. Group related articles into topics
4. Generate topic summary
5. Classify article stance relative to topic
6. Store structured output
7. Render topic-first UI

---

## AI Usage

Use AI for:

- article summarization
- issue extraction
- stance classification

Do NOT use AI as a truth engine.

---

## Storage Constraints

- Prefer storing metadata and summaries over full article content
- Always preserve original source URL
- Respect source usage restrictions

---

## MVP Priority

Prioritize:

1. topic list
2. topic detail
3. stance grouping
4. classification storage
5. fact-check section

Do not overbuild auth, personalization, or social features in v1.
