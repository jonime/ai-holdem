
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "actions": {
                  Row: {
                    "action": string,"amount": number | null,"created_at": string,"game_id": string,"hand_id": string,"id": string,"player_id": string,"sequence": number,"state_after": NonNullable<Json>,"state_before": NonNullable<Json>,"street": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"amount"?: number | null,"created_at"?: string,"game_id": string,"hand_id": string,"id"?: string,"player_id": string,"sequence": number,"state_after": NonNullable<Json>,"state_before": NonNullable<Json>,"street": string
                  }
                  Update: {
                    "action"?: string,"amount"?: number | null,"created_at"?: string,"game_id"?: string,"hand_id"?: string,"id"?: string,"player_id"?: string,"sequence"?: number,"state_after"?: NonNullable<Json>,"state_before"?: NonNullable<Json>,"street"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "actions_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "actions_hand_id_fkey"
      columns: ["hand_id"]
isOneToOne: false
      referencedRelation: "hands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "actions_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "game_players"
      referencedColumns: ["id"]
    }
                  ]
                },"bot_step_claims": {
                  Row: {
                    "actor_engine_id": string,"claim_token": string,"expected_version": number,"expires_at": string,"game_id": string,"usage_admitted": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_engine_id": string,"claim_token": string,"expected_version": number,"expires_at": string,"game_id": string,"usage_admitted"?: boolean
                  }
                  Update: {
                    "actor_engine_id"?: string,"claim_token"?: string,"expected_version"?: number,"expires_at"?: string,"game_id"?: string,"usage_admitted"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "bot_step_claims_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"creation_attempts": {
                  Row: {
                    "attempt_id": string,"created_at": string,"game_id": string | null,"intent_fingerprint": string,"owner_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_id": string,"created_at"?: string,"game_id"?: string | null,"intent_fingerprint": string,"owner_hash": string
                  }
                  Update: {
                    "attempt_id"?: string,"created_at"?: string,"game_id"?: string | null,"intent_fingerprint"?: string,"owner_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "creation_attempts_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"game_hosts": {
                  Row: {
                    "game_id": string,"host_token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"host_token": string
                  }
                  Update: {
                    "game_id"?: string,"host_token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_hosts_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"game_listings": {
                  Row: {
                    "game_id": string,"host_lease_expires_at": string,"is_public": boolean,"published_at": string,"title": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"host_lease_expires_at"?: string,"is_public"?: boolean,"published_at"?: string,"title"?: string | null
                  }
                  Update: {
                    "game_id"?: string,"host_lease_expires_at"?: string,"is_public"?: boolean,"published_at"?: string,"title"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_listings_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"game_players": {
                  Row: {
                    "ai_difficulty": string | null,"bot_id": string | null,"bot_label": string | null,"bot_model_id": string | null,"bot_profile_id": string | null,"bot_provider": string | null,"controller": string,"created_at": string,"engine_player_id": string | null,"game_id": string,"id": string,"is_host": boolean,"leaving": boolean,"name": string,"player_token": string | null,"seat": number,"stack": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_difficulty"?: string | null,"bot_id"?: string | null,"bot_label"?: string | null,"bot_model_id"?: string | null,"bot_profile_id"?: string | null,"bot_provider"?: string | null,"controller"?: string,"created_at"?: string,"engine_player_id"?: string | null,"game_id": string,"id"?: string,"is_host"?: boolean,"leaving"?: boolean,"name": string,"player_token"?: string | null,"seat": number,"stack": number,"status"?: string
                  }
                  Update: {
                    "ai_difficulty"?: string | null,"bot_id"?: string | null,"bot_label"?: string | null,"bot_model_id"?: string | null,"bot_profile_id"?: string | null,"bot_provider"?: string | null,"controller"?: string,"created_at"?: string,"engine_player_id"?: string | null,"game_id"?: string,"id"?: string,"is_host"?: boolean,"leaving"?: boolean,"name"?: string,"player_token"?: string | null,"seat"?: number,"stack"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"games": {
                  Row: {
                    "bots_show_uncontested_wins": boolean,"created_at": string,"current_state": NonNullable<Json>,"hand_number": number,"human_timer_enabled": boolean,"human_timer_hand": number | null,"human_turn_seconds": number | null,"id": string,"min_seats_to_start": number,"state_schema_version": number,"status": string,"turn_actor_engine_id": string | null,"turn_deadline": string | null,"turn_decision_id": string | null,"turn_hand_number": number | null,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bots_show_uncontested_wins"?: boolean,"created_at"?: string,"current_state": NonNullable<Json>,"hand_number"?: number,"human_timer_enabled"?: boolean,"human_timer_hand"?: number | null,"human_turn_seconds"?: number | null,"id"?: string,"min_seats_to_start"?: number,"state_schema_version"?: number,"status"?: string,"turn_actor_engine_id"?: string | null,"turn_deadline"?: string | null,"turn_decision_id"?: string | null,"turn_hand_number"?: number | null,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "bots_show_uncontested_wins"?: boolean,"created_at"?: string,"current_state"?: NonNullable<Json>,"hand_number"?: number,"human_timer_enabled"?: boolean,"human_timer_hand"?: number | null,"human_turn_seconds"?: number | null,"id"?: string,"min_seats_to_start"?: number,"state_schema_version"?: number,"status"?: string,"turn_actor_engine_id"?: string | null,"turn_deadline"?: string | null,"turn_decision_id"?: string | null,"turn_hand_number"?: number | null,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"hand_card_reveals": {
                  Row: {
                    "created_at": string,"engine_player_id": string,"game_id": string,"hand_id": string,"hand_number": number,"id": string,"player_id": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"engine_player_id": string,"game_id": string,"hand_id": string,"hand_number": number,"id"?: string,"player_id": string,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"engine_player_id"?: string,"game_id"?: string,"hand_id"?: string,"hand_number"?: number,"id"?: string,"player_id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hand_card_reveals_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hand_card_reveals_hand_id_fkey"
      columns: ["hand_id"]
isOneToOne: false
      referencedRelation: "hands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hand_card_reveals_player_id_fkey"
      columns: ["player_id"]
isOneToOne: false
      referencedRelation: "game_players"
      referencedColumns: ["id"]
    }
                  ]
                },"hands": {
                  Row: {
                    "completed_at": string | null,"final_state": Json | null,"game_id": string,"hand_number": number,"id": string,"initial_state": NonNullable<Json>,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"final_state"?: Json | null,"game_id": string,"hand_number": number,"id"?: string,"initial_state": NonNullable<Json>,"started_at"?: string,"status": string
                  }
                  Update: {
                    "completed_at"?: string | null,"final_state"?: Json | null,"game_id"?: string,"hand_number"?: number,"id"?: string,"initial_state"?: NonNullable<Json>,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hands_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"personal_game_exclusions": {
                  Row: {
                    "game_id": string,"player_token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "game_id": string,"player_token": string
                  }
                  Update: {
                    "game_id"?: string,"player_token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_game_exclusions_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"replay_shares": {
                  Row: {
                    "created_at": string,"creator_token": string,"expires_at": string,"game_id": string,"hand_id": string,"link_token": string,"revoked_at": string | null,"snapshot": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"creator_token": string,"expires_at"?: string,"game_id": string,"hand_id": string,"link_token": string,"revoked_at"?: string | null,"snapshot": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"creator_token"?: string,"expires_at"?: string,"game_id"?: string,"hand_id"?: string,"link_token"?: string,"revoked_at"?: string | null,"snapshot"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "replay_shares_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "replay_shares_hand_id_fkey"
      columns: ["hand_id"]
isOneToOne: false
      referencedRelation: "hands"
      referencedColumns: ["id"]
    }
                  ]
                },"usage_allowances": {
                  Row: {
                    "attempts": (string)[],"key": string,"last_seen": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: (string)[],"key": string,"last_seen": string
                  }
                  Update: {
                    "attempts"?: (string)[],"key"?: string,"last_seen"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "acquire_bot_step_claim":
{ Args: { "p_actor_engine_id": string,"p_claim_token": string,"p_expected_version": number,"p_game_id": string }; Returns: Json
                           },
"admit_external_bot_call":
{ Args: { "p_claim_token": string,"p_expected_version": number,"p_game_allowance": number,"p_game_id": string,"p_game_window_ms": number,"p_owner_allowance": number,"p_owner_hash": string,"p_owner_window_ms": number }; Returns: Json
                           },
"admit_game_creation":
{ Args: { "p_ip_allowance": number,"p_ip_hash": string,"p_owner_allowance": number,"p_owner_hash": string,"p_window_ms": number }; Returns: Json
                           },
"advance_departure_if_version":
{ Args: { "p_driver_token": string,"p_expected_version": number,"p_fold": Json,"p_game_id": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"apply_ai_action_and_leave_if_version":
{ Args: { "p_action": string,"p_ai_state": Json,"p_amount": number,"p_auto_reveal_player_engine_id"?: string,"p_auto_reveal_reason"?: string,"p_bot_id": string,"p_bot_label": string,"p_bot_model_id": string,"p_bot_provider": string,"p_choice": string,"p_confidence": number,"p_cost": number,"p_current_state": Json,"p_duration_ms": number,"p_expected_version": number,"p_game_id": string,"p_hand_complete": boolean,"p_hand_number": number,"p_legal_actions": Json,"p_matched_rule": string,"p_player_engine_id": string,"p_probabilities": Json,"p_prompt_version": string,"p_raise_size_choice": string,"p_raise_size_probabilities": Json,"p_raw_response": Json,"p_state_after": Json,"p_state_before": Json,"p_state_schema_version": number,"p_status": string,"p_street": string,"p_usage": Json }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"apply_ai_action_if_version":
{ Args: { "p_action": string,"p_ai_state": Json,"p_amount": number,"p_auto_reveal_player_engine_id"?: string,"p_auto_reveal_reason"?: string,"p_bot_id": string,"p_bot_label": string,"p_bot_model_id": string,"p_bot_provider": string,"p_choice": string,"p_confidence": number,"p_cost": number,"p_current_state": Json,"p_duration_ms": number,"p_expected_version": number,"p_game_id": string,"p_hand_complete": boolean,"p_hand_number": number,"p_legal_actions": Json,"p_matched_rule": string,"p_player_engine_id": string,"p_probabilities": Json,"p_prompt_version": string,"p_raise_size_choice": string,"p_raise_size_probabilities": Json,"p_raw_response": Json,"p_state_after": Json,"p_state_before": Json,"p_state_schema_version": number,"p_status": string,"p_street": string,"p_usage": Json }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"apply_human_action_before_departures":
{ Args: { "p_action": string,"p_amount": number,"p_auto_reveal_player_engine_id"?: string,"p_auto_reveal_reason"?: string,"p_current_state": Json,"p_expected_version": number,"p_game_id": string,"p_hand_complete": boolean,"p_hand_number": number,"p_player_engine_id": string,"p_state_after": Json,"p_state_before": Json,"p_state_schema_version": number,"p_status": string,"p_street": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"apply_human_action_if_version":
{ Args: { "p_action": string,"p_amount": number,"p_auto_reveal_player_engine_id"?: string,"p_auto_reveal_reason"?: string,"p_current_state": Json,"p_expected_version": number,"p_game_id": string,"p_hand_complete": boolean,"p_hand_number": number,"p_player_engine_id": string,"p_state_after": Json,"p_state_before": Json,"p_state_schema_version": number,"p_status": string,"p_street": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"assign_bot_to_seat_if_version":
{ Args: { "p_ai_difficulty": string,"p_bot_id": string,"p_bot_label": string,"p_bot_model_id": string,"p_bot_profile_id": string,"p_bot_provider": string,"p_expected_version": number,"p_game_id": string,"p_host_token": string,"p_name": string,"p_seat": number }; Returns: Json
                           },
"claim_game_seat_before_removal":
{ Args: { "p_expected_version": number,"p_game_id": string,"p_name": string,"p_player_token": string,"p_seat": number }; Returns: Json
                           },
"claim_game_seat_if_version":
{ Args: { "p_expected_version": number,"p_game_id": string,"p_name": string,"p_player_token": string,"p_seat": number }; Returns: Json
                           },
"commit_bot_action_with_claim":
{ Args: { "p_action": string,"p_ai_state": Json,"p_amount": number,"p_auto_reveal_player_engine_id"?: string,"p_auto_reveal_reason"?: string,"p_bot_id": string,"p_bot_label": string,"p_bot_model_id": string,"p_bot_provider": string,"p_choice": string,"p_claim_token": string,"p_confidence": number,"p_cost": number,"p_current_state": Json,"p_duration_ms": number,"p_expected_version": number,"p_game_id": string,"p_hand_complete": boolean,"p_hand_number": number,"p_legal_actions": Json,"p_matched_rule": string,"p_player_engine_id": string,"p_probabilities": Json,"p_prompt_version": string,"p_raise_size_choice": string,"p_raise_size_probabilities": Json,"p_raw_response": Json,"p_state_after": Json,"p_state_before": Json,"p_state_schema_version": number,"p_status": string,"p_street": string,"p_usage": Json }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"commit_bot_departure_with_claim":
{ Args: { "p_action": string,"p_ai_state": Json,"p_amount": number,"p_auto_reveal_player_engine_id"?: string,"p_auto_reveal_reason"?: string,"p_bot_id": string,"p_bot_label": string,"p_bot_model_id": string,"p_bot_provider": string,"p_choice": string,"p_claim_token": string,"p_confidence": number,"p_cost": number,"p_current_state": Json,"p_duration_ms": number,"p_expected_version": number,"p_game_id": string,"p_hand_complete": boolean,"p_hand_number": number,"p_legal_actions": Json,"p_matched_rule": string,"p_player_engine_id": string,"p_probabilities": Json,"p_prompt_version": string,"p_raise_size_choice": string,"p_raise_size_probabilities": Json,"p_raw_response": Json,"p_state_after": Json,"p_state_before": Json,"p_state_schema_version": number,"p_status": string,"p_street": string,"p_usage": Json }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"commit_departure_fold":
{ Args: { "p_expected_version": number,"p_fold": Json,"p_game_id": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"commit_with_turn_timer":
{ Args: { "p_arguments": Json,"p_decision_id"?: string,"p_driver_token"?: string,"p_operation": string,"p_transition": Json }; Returns: Json
                           },
"create_game_session":
{ Args: { "p_current_state": Json,"p_hand_number": number,"p_host_token": string,"p_players": Json,"p_state_schema_version": number,"p_status": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_game_with_attempt":
{ Args: { "p_arguments": Json,"p_attempt_id": string,"p_fingerprint": string,"p_ip_allowance": number,"p_ip_hash": string,"p_owner": string,"p_owner_allowance": number,"p_owner_hash": string,"p_transition"?: Json,"p_window_ms": number }; Returns: Json
                           },
"depart_game_seat_if_version":
{ Args: { "p_expected_version": number,"p_fold"?: Json,"p_game_id": string,"p_player_token": string,"p_seat": number }; Returns: Json
                           },
"get_bot_hand_context":
{ Args: { "p_game_id": string,"p_hand_number": number }; Returns: Json
                           },
"get_bot_session_context":
{ Args: { "p_game_id": string,"p_hand_number": number }; Returns: Json
                           },
"get_game_feed":
{ Args: { "p_game_id": string,"p_hand_limit"?: number }; Returns: Json
                           },
"get_game_feed_since":
{ Args: { "p_game_id": string,"p_hand_limit"?: number,"p_since_hand": number }; Returns: Json
                           },
"get_game_read_snapshot":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"get_hand_replay":
{ Args: { "p_game_id": string,"p_hand_number": number }; Returns: Json
                           },
"get_personal_results_page":
{ Args: { "p_after_hand"?: number,"p_game_id": string,"p_through_hand"?: number }; Returns: Json
                           },
"join_public_game_if_version":
{ Args: { "p_expected_version": number,"p_game_id": string,"p_name": string,"p_player_token": string }; Returns: Json
                           },
"list_my_games":
{ Args: { "p_player_token": string }; Returns: {
              "bot_count": number,"game_id": string,"human_count": number,"occupied_seats": number,"removal": string,"status": string,"title": string,"total_seats": number,"updated_at": string,"version": number,"viewer_seated": boolean
            }[]
                           },
"list_public_game_exclusions":
{ Args: { "p_player_token": string }; Returns: {
              "game_id": string
            }[]
                           },
"list_public_games":
{ Args: { "p_cursor_game_id"?: string,"p_cursor_published_at"?: string,"p_limit"?: number,"p_player_token": string }; Returns: {
              "big_blind": number,"bot_count": number,"game_id": string,"human_count": number,"human_turn_seconds": number,"occupied_seats": number,"published_at": string,"small_blind": number,"starting_stack": number,"title": string,"total_seats": number,"version": number
            }[]
                           },
"list_public_games_before_timers":
{ Args: { "p_cursor_game_id"?: string,"p_cursor_published_at"?: string,"p_limit"?: number,"p_player_token": string }; Returns: {
              "big_blind": number,"bot_count": number,"game_id": string,"human_count": number,"occupied_seats": number,"published_at": string,"small_blind": number,"starting_stack": number,"title": string,"total_seats": number,"version": number
            }[]
                           },
"list_replay_shares":
{ Args: { "p_before_created_at"?: string,"p_before_token"?: string,"p_creator_token": string }; Returns: Json
                           },
"manage_replay_share":
{ Args: { "p_creator_token": string,"p_game_id": string,"p_hand_number": number,"p_history": Json,"p_ip_allowance": number,"p_ip_hash": string,"p_link_token": string,"p_operation": string,"p_owner_allowance": number,"p_owner_hash": string,"p_snapshot": Json,"p_window_ms": number }; Returns: Json
                           },
"read_replay_share":
{ Args: { "p_link_token": string }; Returns: Json
                           },
"release_bot_step_claim":
{ Args: { "p_claim_token": string,"p_game_id": string }; Returns: undefined
                           },
"release_game_seat_if_version":
{ Args: { "p_expected_version": number,"p_game_id": string,"p_player_token": string,"p_seat": number }; Returns: Json
                           },
"remove_game_if_version":
{ Args: { "p_expected_version": number,"p_fold"?: Json,"p_game_id": string,"p_operation": string,"p_player_token": string }; Returns: Json
                           },
"renew_game_listing_lease":
{ Args: { "p_game_id": string,"p_host_token": string }; Returns: boolean
                           },
"reserve_usage":
{ Args: { "p_allowances": (number)[],"p_codes": (string)[],"p_keys": (string)[],"p_windows_ms": (number)[] }; Returns: Json
                           },
"reveal_human_cards_if_version":
{ Args: { "p_expected_version": number,"p_game_id": string,"p_hand_number": number,"p_player_token": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"revoke_owned_replay_share":
{ Args: { "p_creator_token": string,"p_link_token": string }; Returns: Json
                           },
"set_game_publication_if_version":
{ Args: { "p_expected_version": number,"p_game_id": string,"p_host_token": string,"p_is_public": boolean,"p_title": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"start_game_if_version":
{ Args: { "p_current_state": Json,"p_expected_version": number,"p_game_id": string,"p_hand_number": number,"p_state_schema_version": number }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"start_next_hand_if_version":
{ Args: { "p_current_state": Json,"p_expected_version": number,"p_game_id": string,"p_hand_number": number,"p_state_schema_version": number }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_game_state_if_version":
{ Args: { "p_current_state": Json,"p_expected_version": number,"p_game_id": string,"p_hand_number": number,"p_state_schema_version": number,"p_status": string }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_seat_count_if_version":
{ Args: { "p_current_state": Json,"p_expected_version": number,"p_game_id": string,"p_seat_count": number,"p_state_schema_version": number }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_table_settings_if_version":
{ Args: { "p_big_blind": number,"p_bots_show_uncontested_wins": boolean,"p_current_state": Json,"p_expected_version": number,"p_game_id": string,"p_seat_count": number,"p_small_blind": number,"p_starting_stack": number,"p_state_schema_version": number }; Returns: {
              "bots_show_uncontested_wins": boolean,
"created_at": string,
"current_state": NonNullable<Json>,
"hand_number": number,
"human_timer_enabled": boolean,
"human_timer_hand": number | null,
"human_turn_seconds": number | null,
"id": string,
"min_seats_to_start": number,
"state_schema_version": number,
"status": string,
"turn_actor_engine_id": string | null,
"turn_deadline": string | null,
"turn_decision_id": string | null,
"turn_hand_number": number | null,
"updated_at": string,
"version": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: false
        isSetofReturn: true
      } }
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
  "public": {
          Enums: {
            
          }
        }
} as const
