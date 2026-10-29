
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
            "content_items": {
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
                },"ingestion_runs": {
                  Row: {
                    "errors": NonNullable<Json>,"finished_at": string | null,"heartbeat_at": string,"id": string,"items_new": number,"projects_refreshed": number,"sources_done": number,"sources_failed": number,"started_at": string,"status": string,"trigger": string
                  }
                  ComputedFields: never
                  Insert: {
                    "errors"?: NonNullable<Json>,"finished_at"?: string | null,"heartbeat_at"?: string,"id"?: string,"items_new"?: number,"projects_refreshed"?: number,"sources_done"?: number,"sources_failed"?: number,"started_at"?: string,"status"?: string,"trigger": string
                  }
                  Update: {
                    "errors"?: NonNullable<Json>,"finished_at"?: string | null,"heartbeat_at"?: string,"id"?: string,"items_new"?: number,"projects_refreshed"?: number,"sources_done"?: number,"sources_failed"?: number,"started_at"?: string,"status"?: string,"trigger"?: string
                  }
                  Relationships: [
                    
                  ]
                },"preferences": {
                  Row: {
                    "ai_calls_count": number,"ai_calls_day": string | null,"ai_enabled": boolean,"excluded_topics": (string)[],"hidden_source_ids": (string)[],"interests": (string)[],"languages": (string)[],"last_manual_refresh_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_calls_count"?: number,"ai_calls_day"?: string | null,"ai_enabled"?: boolean,"excluded_topics"?: (string)[],"hidden_source_ids"?: (string)[],"interests"?: (string)[],"languages"?: (string)[],"last_manual_refresh_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ai_calls_count"?: number,"ai_calls_day"?: string | null,"ai_enabled"?: boolean,"excluded_topics"?: (string)[],"hidden_source_ids"?: (string)[],"interests"?: (string)[],"languages"?: (string)[],"last_manual_refresh_at"?: string | null,"updated_at"?: string,"user_id"?: string
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
                    "content_item_id": string,"created_at": string,"id": string,"project_id": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_item_id": string,"created_at"?: string,"id"?: string,"project_id": string,"reason": string
                  }
                  Update: {
                    "content_item_id"?: string,"created_at"?: string,"id"?: string,"project_id"?: string,"reason"?: string
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
                    "archived_at": string | null,"audience": string | null,"constraints": string | null,"context_version": number,"created_at": string,"description": string,"features": (string)[],"id": string,"insights_refreshed_at": string | null,"insights_version": number,"name": string,"notes": string | null,"owner_id": string,"problem": string | null,"project_type": string,"stage": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"audience"?: string | null,"constraints"?: string | null,"context_version"?: number,"created_at"?: string,"description": string,"features"?: (string)[],"id"?: string,"insights_refreshed_at"?: string | null,"insights_version"?: number,"name": string,"notes"?: string | null,"owner_id"?: string,"problem"?: string | null,"project_type"?: string,"stage"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"audience"?: string | null,"constraints"?: string | null,"context_version"?: number,"created_at"?: string,"description"?: string,"features"?: (string)[],"id"?: string,"insights_refreshed_at"?: string | null,"insights_version"?: number,"name"?: string,"notes"?: string | null,"owner_id"?: string,"problem"?: string | null,"project_type"?: string,"stage"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sources": {
                  Row: {
                    "consecutive_failures": number,"created_at": string,"etag": string | null,"id": string,"in_catalog": boolean,"is_official": boolean,"key": string,"kind": string,"language": string,"last_error": string | null,"last_fetched_at": string | null,"last_modified": string | null,"last_success_at": string | null,"name": string,"next_fetch_at": string,"quality": number,"site_url": string | null,"tech_keys": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "consecutive_failures"?: number,"created_at"?: string,"etag"?: string | null,"id"?: string,"in_catalog"?: boolean,"is_official"?: boolean,"key": string,"kind": string,"language"?: string,"last_error"?: string | null,"last_fetched_at"?: string | null,"last_modified"?: string | null,"last_success_at"?: string | null,"name": string,"next_fetch_at"?: string,"quality"?: number,"site_url"?: string | null,"tech_keys"?: (string)[]
                  }
                  Update: {
                    "consecutive_failures"?: number,"created_at"?: string,"etag"?: string | null,"id"?: string,"in_catalog"?: boolean,"is_official"?: boolean,"key"?: string,"kind"?: string,"language"?: string,"last_error"?: string | null,"last_fetched_at"?: string | null,"last_modified"?: string | null,"last_success_at"?: string | null,"name"?: string,"next_fetch_at"?: string,"quality"?: number,"site_url"?: string | null,"tech_keys"?: (string)[]
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
