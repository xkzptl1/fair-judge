// Auto-generated types for the Supabase schema.
// Update this file when schema.sql changes.

export type Stance = "support" | "challenge" | "report_only" | "mixed" | "unclear";

export interface Database {
  public: {
    Tables: {
      topics: {
        Row: {
          id: string;
          title: string;
          summary: string | null;
          main_issues: string[] | null;
          first_seen_at: string;
          last_updated_at: string;
          article_count: number;
          source_count: number;
          is_active: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["topics"]["Row"], "id" | "first_seen_at" | "last_updated_at">;
        Update: Partial<Database["public"]["Tables"]["topics"]["Insert"]>;
      };
      sources: {
        Row: {
          id: string;
          domain: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["sources"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["sources"]["Insert"]>;
      };
      articles: {
        Row: {
          id: string;
          topic_id: string;
          source_id: string;
          title: string;
          url: string;
          summary: string | null;
          published_at: string | null;
          fetched_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["articles"]["Row"], "id" | "fetched_at">;
        Update: Partial<Database["public"]["Tables"]["articles"]["Insert"]>;
      };
      article_classifications: {
        Row: {
          id: string;
          article_id: string;
          topic_id: string;
          stance: Stance;
          reason: string | null;
          confidence: number | null;
          model: string | null;
          classified_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["article_classifications"]["Row"], "id" | "classified_at">;
        Update: Partial<Database["public"]["Tables"]["article_classifications"]["Insert"]>;
      };
      fact_checks: {
        Row: {
          id: string;
          topic_id: string;
          claim: string;
          verdict: string | null;
          explanation: string | null;
          source_url: string | null;
          fact_checker: string | null;
          checked_at: string | null;
          fetched_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["fact_checks"]["Row"], "id" | "fetched_at">;
        Update: Partial<Database["public"]["Tables"]["fact_checks"]["Insert"]>;
      };
    };
  };
}
