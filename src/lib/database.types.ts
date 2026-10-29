
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "advisory_package_checks": {
                  Row: {
                    "checked_at": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_at"?: string,"name": string
                  }
                  Update: {
                    "checked_at"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_admins": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"content_items": {
                  Row: {
                    "canonical_url": string,"collected_at": string,"content_hash": string,"content_kind": string,"excerpt": string | null,"external_id": string,"id": string,"is_prerelease": boolean,"language": string | null,"last_seen_at": string,"published_at": string | null,"release_tag": string | null,"source_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canonical_url": string,"collected_at"?: string,"content_hash": string,"content_kind"?: string,"excerpt"?: string | null,"external_id": string,"id"?: string,"is_prerelease"?: boolean,"language"?: string | null,"last_seen_at"?: string,"published_at"?: string | null,"release_tag"?: string | null,"source_id": string,"title": string
                  }
                  Update: {
                    "canonical_url"?: string,"collected_at"?: string,"content_hash"?: string,"content_kind"?: string,"excerpt"?: string | null,"external_id"?: string,"id"?: string,"is_prerelease"?: boolean,"language"?: string | null,"last_seen_at"?: string,"published_at"?: string | null,"release_tag"?: string | null,"source_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_items_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"dependency_entries": {
                  Row: {
                    "declared": string | null,"excluded": boolean,"id": string,"is_direct": boolean,"name": string,"project_id": string,"resolution": string,"scope": string,"snapshot_id": string,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "declared"?: string | null,"excluded"?: boolean,"id"?: string,"is_direct"?: boolean,"name": string,"project_id": string,"resolution": string,"scope"?: string,"snapshot_id": string,"version"?: string | null
                  }
                  Update: {
                    "declared"?: string | null,"excluded"?: boolean,"id"?: string,"is_direct"?: boolean,"name"?: string,"project_id"?: string,"resolution"?: string,"scope"?: string,"snapshot_id"?: string,"version"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dependency_entries_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dependency_entries_snapshot_id_fkey"
      columns: ["snapshot_id"]
isOneToOne: false
      referencedRelation: "dependency_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"dependency_findings": {
                  Row: {
                    "advisory_updated_at": string | null,"computed_at": string,"declared": string | null,"ghsa_id": string,"id": string,"is_direct": boolean,"matched_range": string | null,"package": string,"patched": NonNullable<Json>,"project_id": string,"scope": string,"snapshot_id": string,"status": string,"superseded_at": string | null,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "advisory_updated_at"?: string | null,"computed_at"?: string,"declared"?: string | null,"ghsa_id": string,"id"?: string,"is_direct"?: boolean,"matched_range"?: string | null,"package": string,"patched"?: NonNullable<Json>,"project_id": string,"scope"?: string,"snapshot_id": string,"status": string,"superseded_at"?: string | null,"version"?: string | null
                  }
                  Update: {
                    "advisory_updated_at"?: string | null,"computed_at"?: string,"declared"?: string | null,"ghsa_id"?: string,"id"?: string,"is_direct"?: boolean,"matched_range"?: string | null,"package"?: string,"patched"?: NonNullable<Json>,"project_id"?: string,"scope"?: string,"snapshot_id"?: string,"status"?: string,"superseded_at"?: string | null,"version"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dependency_findings_ghsa_id_fkey"
      columns: ["ghsa_id"]
isOneToOne: false
      referencedRelation: "security_advisories"
      referencedColumns: ["ghsa_id"]
    },{
      foreignKeyName: "dependency_findings_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dependency_findings_snapshot_id_fkey"
      columns: ["snapshot_id"]
isOneToOne: false
      referencedRelation: "dependency_snapshots"
      referencedColumns: ["id"]
    }
                  ]
                },"dependency_snapshots": {
                  Row: {
                    "analysis_error": string | null,"analysis_status": string,"analyzed_at": string | null,"excluded_patterns": (string)[],"file_name": string | null,"id": string,"imported_at": string,"lockfile_version": number | null,"origin": string,"project_id": string,"stats": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "analysis_error"?: string | null,"analysis_status"?: string,"analyzed_at"?: string | null,"excluded_patterns"?: (string)[],"file_name"?: string | null,"id"?: string,"imported_at"?: string,"lockfile_version"?: number | null,"origin": string,"project_id": string,"stats"?: NonNullable<Json>
                  }
                  Update: {
                    "analysis_error"?: string | null,"analysis_status"?: string,"analyzed_at"?: string | null,"excluded_patterns"?: (string)[],"file_name"?: string | null,"id"?: string,"imported_at"?: string,"lockfile_version"?: number | null,"origin"?: string,"project_id"?: string,"stats"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "dependency_snapshots_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"finding_dismissals": {
                  Row: {
                    "created_at": string,"ghsa_id": string,"package": string,"project_id": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ghsa_id": string,"package": string,"project_id": string,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"ghsa_id"?: string,"package"?: string,"project_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "finding_dismissals_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"ingestion_runs": {
                  Row: {
                    "advisories_updated": number,"errors": NonNullable<Json>,"finished_at": string | null,"heartbeat_at": string,"id": string,"items_new": number,"projects_refreshed": number,"sources_deferred": number,"sources_done": number,"sources_failed": number,"started_at": string,"status": string,"trigger": string
                  }
                  ComputedFields: never
                  Insert: {
                    "advisories_updated"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"heartbeat_at"?: string,"id"?: string,"items_new"?: number,"projects_refreshed"?: number,"sources_deferred"?: number,"sources_done"?: number,"sources_failed"?: number,"started_at"?: string,"status"?: string,"trigger": string
                  }
                  Update: {
                    "advisories_updated"?: number,"errors"?: NonNullable<Json>,"finished_at"?: string | null,"heartbeat_at"?: string,"id"?: string,"items_new"?: number,"projects_refreshed"?: number,"sources_deferred"?: number,"sources_done"?: number,"sources_failed"?: number,"started_at"?: string,"status"?: string,"trigger"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ops_alerts": {
                  Row: {
                    "first_seen_at": string,"key": string,"last_message": string | null,"last_sent_at": string | null,"occurrences": number
                  }
                  ComputedFields: never
                  Insert: {
                    "first_seen_at"?: string,"key": string,"last_message"?: string | null,"last_sent_at"?: string | null,"occurrences"?: number
                  }
                  Update: {
                    "first_seen_at"?: string,"key"?: string,"last_message"?: string | null,"last_sent_at"?: string | null,"occurrences"?: number
                  }
                  Relationships: [
                    
                  ]
                },"ops_state": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"preferences": {
                  Row: {
                    "ai_calls_count": number,"ai_calls_day": string | null,"ai_enabled": boolean,"excluded_topics": (string)[],"hidden_source_ids": (string)[],"interests": (string)[],"languages": (string)[],"last_manual_refresh_at": string | null,"updated_at": string,"user_id": string,"visual_effects": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_calls_count"?: number,"ai_calls_day"?: string | null,"ai_enabled"?: boolean,"excluded_topics"?: (string)[],"hidden_source_ids"?: (string)[],"interests"?: (string)[],"languages"?: (string)[],"last_manual_refresh_at"?: string | null,"updated_at"?: string,"user_id": string,"visual_effects"?: boolean
                  }
                  Update: {
                    "ai_calls_count"?: number,"ai_calls_day"?: string | null,"ai_enabled"?: boolean,"excluded_topics"?: (string)[],"hidden_source_ids"?: (string)[],"interests"?: (string)[],"languages"?: (string)[],"last_manual_refresh_at"?: string | null,"updated_at"?: string,"user_id"?: string,"visual_effects"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"project_actions": {
                  Row: {
                    "content_item_id": string | null,"created_at": string,"id": string,"note": string | null,"project_id": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_item_id"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"project_id": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "content_item_id"?: string | null,"created_at"?: string,"id"?: string,"note"?: string | null,"project_id"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_actions_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_actions_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_feedback": {
                  Row: {
                    "content_item_id": string,"created_at": string,"id": string,"project_id": string,"reason": string,"source_id": string | null,"tech_keys": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "content_item_id": string,"created_at"?: string,"id"?: string,"project_id": string,"reason": string,"source_id"?: string | null,"tech_keys"?: (string)[]
                  }
                  Update: {
                    "content_item_id"?: string,"created_at"?: string,"id"?: string,"project_id"?: string,"reason"?: string,"source_id"?: string | null,"tech_keys"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_feedback_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_feedback_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_feedback_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"project_insights": {
                  Row: {
                    "ai": Json | null,"ai_content_hash": string | null,"ai_context_version": number | null,"computed_at": string,"content_hash": string,"content_item_id": string,"context_version": number,"matched_features": (string)[],"matched_techs": (string)[],"priority": string,"project_id": string,"reasons": NonNullable<Json>,"score": number,"why": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai"?: Json | null,"ai_content_hash"?: string | null,"ai_context_version"?: number | null,"computed_at"?: string,"content_hash": string,"content_item_id": string,"context_version": number,"matched_features"?: (string)[],"matched_techs"?: (string)[],"priority": string,"project_id": string,"reasons"?: NonNullable<Json>,"score": number,"why": string
                  }
                  Update: {
                    "ai"?: Json | null,"ai_content_hash"?: string | null,"ai_context_version"?: number | null,"computed_at"?: string,"content_hash"?: string,"content_item_id"?: string,"context_version"?: number,"matched_features"?: (string)[],"matched_techs"?: (string)[],"priority"?: string,"project_id"?: string,"reasons"?: NonNullable<Json>,"score"?: number,"why"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_insights_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_insights_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_resources": {
                  Row: {
                    "created_at": string,"id": string,"note": string | null,"project_id": string,"title": string,"url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"project_id": string,"title": string,"url": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"note"?: string | null,"project_id"?: string,"title"?: string,"url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_resources_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"project_sources": {
                  Row: {
                    "created_at": string,"project_id": string,"source_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"project_id": string,"source_id": string
                  }
                  Update: {
                    "created_at"?: string,"project_id"?: string,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_sources_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "project_sources_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"project_technologies": {
                  Row: {
                    "category": string,"display_name": string,"id": string,"project_id": string,"status": string,"tech_key": string,"version": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"display_name": string,"id"?: string,"project_id": string,"status"?: string,"tech_key": string,"version"?: string | null
                  }
                  Update: {
                    "category"?: string,"display_name"?: string,"id"?: string,"project_id"?: string,"status"?: string,"tech_key"?: string,"version"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "project_technologies_project_id_fkey"
      columns: ["project_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id"]
    }
                  ]
                },"projects": {
                  Row: {
                    "archived_at": string | null,"audience": string | null,"constraints": string | null,"context_version": number,"created_at": string,"description": string,"features": (string)[],"id": string,"insights_refreshed_at": string | null,"insights_version": number,"name": string,"notes": string | null,"owner_id": string,"problem": string | null,"project_type": string,"ranking_signature": string | null,"stage": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"audience"?: string | null,"constraints"?: string | null,"context_version"?: number,"created_at"?: string,"description": string,"features"?: (string)[],"id"?: string,"insights_refreshed_at"?: string | null,"insights_version"?: number,"name": string,"notes"?: string | null,"owner_id"?: string,"problem"?: string | null,"project_type"?: string,"ranking_signature"?: string | null,"stage"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"audience"?: string | null,"constraints"?: string | null,"context_version"?: number,"created_at"?: string,"description"?: string,"features"?: (string)[],"id"?: string,"insights_refreshed_at"?: string | null,"insights_version"?: number,"name"?: string,"notes"?: string | null,"owner_id"?: string,"problem"?: string | null,"project_type"?: string,"ranking_signature"?: string | null,"stage"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"security_advisories": {
                  Row: {
                    "cve_id": string | null,"fetched_at": string,"ghsa_id": string,"html_url": string,"packages": (string)[],"published_at": string | null,"severity": string,"source": string,"summary": string,"updated_at": string | null,"vulnerabilities": NonNullable<Json>,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cve_id"?: string | null,"fetched_at"?: string,"ghsa_id": string,"html_url": string,"packages"?: (string)[],"published_at"?: string | null,"severity"?: string,"source"?: string,"summary": string,"updated_at"?: string | null,"vulnerabilities"?: NonNullable<Json>,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "cve_id"?: string | null,"fetched_at"?: string,"ghsa_id"?: string,"html_url"?: string,"packages"?: (string)[],"published_at"?: string | null,"severity"?: string,"source"?: string,"summary"?: string,"updated_at"?: string | null,"vulnerabilities"?: NonNullable<Json>,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"source_proposals": {
                  Row: {
                    "created_at": string,"id": string,"justification": string | null,"language": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"topics": (string)[],"url": string,"user_id": string,"validation": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"justification"?: string | null,"language": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"topics"?: (string)[],"url": string,"user_id"?: string,"validation"?: Json | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"justification"?: string | null,"language"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"topics"?: (string)[],"url"?: string,"user_id"?: string,"validation"?: Json | null
                  }
                  Relationships: [
                    
                  ]
                },"sources": {
                  Row: {
                    "consecutive_failures": number,"created_at": string,"etag": string | null,"id": string,"in_catalog": boolean,"is_official": boolean,"key": string,"kind": string,"language": string,"last_error": string | null,"last_error_kind": string | null,"last_fetched_at": string | null,"last_modified": string | null,"last_success_at": string | null,"name": string,"next_fetch_at": string,"quality": number,"site_url": string | null,"tech_keys": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "consecutive_failures"?: number,"created_at"?: string,"etag"?: string | null,"id"?: string,"in_catalog"?: boolean,"is_official"?: boolean,"key": string,"kind": string,"language"?: string,"last_error"?: string | null,"last_error_kind"?: string | null,"last_fetched_at"?: string | null,"last_modified"?: string | null,"last_success_at"?: string | null,"name": string,"next_fetch_at"?: string,"quality"?: number,"site_url"?: string | null,"tech_keys"?: (string)[]
                  }
                  Update: {
                    "consecutive_failures"?: number,"created_at"?: string,"etag"?: string | null,"id"?: string,"in_catalog"?: boolean,"is_official"?: boolean,"key"?: string,"kind"?: string,"language"?: string,"last_error"?: string | null,"last_error_kind"?: string | null,"last_fetched_at"?: string | null,"last_modified"?: string | null,"last_success_at"?: string | null,"name"?: string,"next_fetch_at"?: string,"quality"?: number,"site_url"?: string | null,"tech_keys"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"user_content_state": {
                  Row: {
                    "content_item_id": string,"favorited_at": string | null,"is_favorite": boolean,"is_read": boolean,"note": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_item_id": string,"favorited_at"?: string | null,"is_favorite"?: boolean,"is_read"?: boolean,"note"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "content_item_id"?: string,"favorited_at"?: string | null,"is_favorite"?: boolean,"is_read"?: boolean,"note"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_content_state_content_item_id_fkey"
      columns: ["content_item_id"]
isOneToOne: false
      referencedRelation: "content_items"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "feed_items":
{ Args: { "p_kind"?: string,"p_project"?: string,"p_q"?: string,"p_read"?: string,"p_since"?: string,"p_source"?: string,"p_tech"?: string }; Returns: {
              "best_score": number,"canonical_url": string,"content_kind": string,"excerpt": string,"id": string,"is_favorite": boolean,"is_prerelease": boolean,"is_read": boolean,"language": string,"projects": Json,"published_at": string,"release_tag": string,"section": string,"sort_date": string,"source_id": string,"source_name": string,"title": string
            }[]
                           },
"feed_page":
{ Args: { "p_after_date"?: string,"p_after_id"?: string,"p_after_score"?: number,"p_exclude"?: (string)[],"p_kind"?: string,"p_limit": number,"p_project"?: string,"p_q"?: string,"p_read"?: string,"p_section": string,"p_since"?: string,"p_sort": string,"p_source"?: string,"p_tech"?: string }; Returns: {
              "best_score": number,"canonical_url": string,"content_kind": string,"excerpt": string,"id": string,"is_favorite": boolean,"is_prerelease": boolean,"is_read": boolean,"language": string,"projects": Json,"published_at": string,"release_tag": string,"section": string,"sort_date": string,"source_id": string,"source_name": string,"title": string
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"owns_project":
{ Args: { "pid": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
