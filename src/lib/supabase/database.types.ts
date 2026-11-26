// The exact description of the database (Round C4). Made by
// "npm run db:types" (scripts/db-types.mjs) from the local test database
// after a reset. Never edited by hand: run the command again after each
// new migration.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_setting_changes": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"id": number,"key": string,"note": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: never,"key"?: string,"note"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: never,"key"?: string,"note"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_setting_changes_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "app_settings"
      referencedColumns: ["key"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "amount_cents": number,"created_at": string,"created_by": string | null,"key": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"created_by"?: string | null,"key"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"app_users": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"display_name": string,"id": string,"role": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"role"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"role"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_users_role_fkey"
      columns: ["role"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["code"]
    }
                  ]
                },"asset_documents": {
                  Row: {
                    "created_at": string,"created_by": string | null,"file_path": string,"hidden": boolean,"hidden_reason": string | null,"id": number,"item_id": string | null,"kind": string,"model_id": string | null,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"file_path"?: string,"hidden"?: boolean,"hidden_reason"?: string | null,"id"?: never,"item_id"?: string | null,"kind"?: string,"model_id"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"file_path"?: string,"hidden"?: boolean,"hidden_reason"?: string | null,"id"?: never,"item_id"?: string | null,"kind"?: string,"model_id"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_documents_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "asset_documents_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_documents_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "asset_documents_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "product_models"
      referencedColumns: ["id"]
    }
                  ]
                },"asset_events": {
                  Row: {
                    "created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"disposal_recipient": string | null,"disposal_route": string | null,"from_condition": string | null,"from_location_id": string | null,"id": number,"item_id": string,"kind": string,"note": string,"photo_path": string | null,"reported_by": string | null,"reported_by_person_id": string | null,"sale_buyer": string | null,"sale_date": string | null,"sale_money_taken_by": string | null,"sale_price_cents": number | null,"status": string,"stocktake_difference_id": number | null,"to_condition": string | null,"to_location_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"disposal_recipient"?: string | null,"disposal_route"?: string | null,"from_condition"?: string | null,"from_location_id"?: string | null,"id"?: never,"item_id"?: string,"kind"?: string,"note"?: string,"photo_path"?: string | null,"reported_by"?: string | null,"reported_by_person_id"?: string | null,"sale_buyer"?: string | null,"sale_date"?: string | null,"sale_money_taken_by"?: string | null,"sale_price_cents"?: number | null,"status"?: string,"stocktake_difference_id"?: number | null,"to_condition"?: string | null,"to_location_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"disposal_recipient"?: string | null,"disposal_route"?: string | null,"from_condition"?: string | null,"from_location_id"?: string | null,"id"?: never,"item_id"?: string,"kind"?: string,"note"?: string,"photo_path"?: string | null,"reported_by"?: string | null,"reported_by_person_id"?: string | null,"sale_buyer"?: string | null,"sale_date"?: string | null,"sale_money_taken_by"?: string | null,"sale_price_cents"?: number | null,"status"?: string,"stocktake_difference_id"?: number | null,"to_condition"?: string | null,"to_location_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_events_from_location_id_fkey"
      columns: ["from_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_events_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "asset_events_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_events_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "asset_events_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_events_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "asset_events_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "asset_events_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "asset_events_stocktake_difference_id_fkey"
      columns: ["stocktake_difference_id"]
isOneToOne: false
      referencedRelation: "stocktake_differences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_events_to_location_id_fkey"
      columns: ["to_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"changed_at": string,"changed_by": string | null,"id": number,"new_values": NonNullable<Json>,"old_values": Json | null,"record_id": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string,"changed_at"?: string,"changed_by"?: string | null,"id"?: never,"new_values"?: NonNullable<Json>,"old_values"?: Json | null,"record_id"?: string,"table_name"?: string
                  }
                  Update: {
                    "action"?: string,"changed_at"?: string,"changed_by"?: string | null,"id"?: never,"new_values"?: NonNullable<Json>,"old_values"?: Json | null,"record_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"board_report_copies": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"month": string,"report": NonNullable<Json>,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"month"?: string,"report"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"month"?: string,"report"?: NonNullable<Json>,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"companies": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"kinds": (string)[],"name": string,"notes": string | null,"phone": string | null,"updated_at": string,"updated_by": string | null,"website": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"kinds"?: (string)[],"name"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"website"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"kinds"?: (string)[],"name"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"expense_categories": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"name": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"expense_claims": {
                  Row: {
                    "amount_cents": number,"category_id": string,"copied_from_id": number | null,"correction_reason": string | null,"corrects_id": number | null,"created_at": string,"created_by": string | null,"description": string,"id": number,"kind": string,"paid_by_person_id": string | null,"paid_to_company_id": string | null,"paid_to_text": string | null,"payment": string,"receipt_date": string,"receipt_lost_reason": string | null,"suggested_fund_id": string | null,"ticket_id": number | null,"updated_at": string,"updated_by": string | null,"vat_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"category_id"?: string,"copied_from_id"?: number | null,"correction_reason"?: string | null,"corrects_id"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: never,"kind"?: string,"paid_by_person_id"?: string | null,"paid_to_company_id"?: string | null,"paid_to_text"?: string | null,"payment"?: string,"receipt_date"?: string,"receipt_lost_reason"?: string | null,"suggested_fund_id"?: string | null,"ticket_id"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"vat_cents"?: number | null
                  }
                  Update: {
                    "amount_cents"?: number,"category_id"?: string,"copied_from_id"?: number | null,"correction_reason"?: string | null,"corrects_id"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: never,"kind"?: string,"paid_by_person_id"?: string | null,"paid_to_company_id"?: string | null,"paid_to_text"?: string | null,"payment"?: string,"receipt_date"?: string,"receipt_lost_reason"?: string | null,"suggested_fund_id"?: string | null,"ticket_id"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"vat_cents"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_claims_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "expense_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_to_company_id_fkey"
      columns: ["paid_to_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_suggested_fund_id_fkey"
      columns: ["suggested_fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "maintenance_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_decisions": {
                  Row: {
                    "claim_id": number,"created_at": string,"created_by": string | null,"fund_id": string | null,"id": number,"kind": string,"needs_second": boolean,"note": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_id"?: number,"created_at"?: string,"created_by"?: string | null,"fund_id"?: string | null,"id"?: never,"kind"?: string,"needs_second"?: boolean,"note"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "claim_id"?: number,"created_at"?: string,"created_by"?: string | null,"fund_id"?: string | null,"id"?: never,"kind"?: string,"needs_second"?: boolean,"note"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_decisions_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_decisions_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_decisions_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_decisions_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_decisions_fund_id_fkey"
      columns: ["fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_files": {
                  Row: {
                    "claim_id": number,"created_at": string,"created_by": string | null,"file_path": string,"id": number,"position": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_id"?: number,"created_at"?: string,"created_by"?: string | null,"file_path"?: string,"id"?: never,"position"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "claim_id"?: number,"created_at"?: string,"created_by"?: string | null,"file_path"?: string,"id"?: never,"position"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_files_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_files_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_files_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_files_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_funds": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"name": string,"restricted": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"restricted"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"restricted"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"expense_repayment_claims": {
                  Row: {
                    "amount_cents": number,"claim_id": number,"created_at": string,"created_by": string | null,"id": number,"repayment_id": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"claim_id"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: never,"repayment_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"claim_id"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: never,"repayment_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_repayment_claims_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_repayment_claims_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_repayment_claims_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_repayment_claims_claim_id_fkey"
      columns: ["claim_id"]
isOneToOne: false
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_repayment_claims_repayment_id_fkey"
      columns: ["repayment_id"]
isOneToOne: false
      referencedRelation: "expense_repayments"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_repayments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"method": string,"paid_on": string,"person_id": string,"reference": string | null,"updated_at": string,"updated_by": string | null,"withdrawn_at": string | null,"withdrawn_by": string | null,"withdrawn_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"method"?: string,"paid_on"?: string,"person_id"?: string,"reference"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"method"?: string,"paid_on"?: string,"person_id"?: string,"reference"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_repayments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_repayments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_repayments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_repayments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                },"item_categories": {
                  Row: {
                    "active": boolean,"contact_person_id": string | null,"created_at": string,"created_by": string | null,"icon": string,"id": string,"name": string,"parent_id": string | null,"service_company_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"contact_person_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"icon"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null,"service_company_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"contact_person_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"icon"?: string,"id"?: string,"name"?: string,"parent_id"?: string | null,"service_company_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_categories_contact_person_id_fkey"
      columns: ["contact_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_categories_contact_person_id_fkey"
      columns: ["contact_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "item_categories_contact_person_id_fkey"
      columns: ["contact_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "item_categories_contact_person_id_fkey"
      columns: ["contact_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "item_categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "item_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_categories_service_company_id_fkey"
      columns: ["service_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "category_id": string,"condition": string | null,"created_at": string,"created_by": string | null,"id": string,"kind": string,"label_serial": string,"location_id": string,"maker_serial": string | null,"minimum_level": number | null,"model_id": string | null,"name": string,"notes": string | null,"photo_path": string | null,"purchase_date": string | null,"service_company_id": string | null,"supplier_company_id": string | null,"unit": string | null,"updated_at": string,"updated_by": string | null,"value_cents": number | null,"warranty_end": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string,"condition"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"label_serial"?: string,"location_id"?: string,"maker_serial"?: string | null,"minimum_level"?: number | null,"model_id"?: string | null,"name"?: string,"notes"?: string | null,"photo_path"?: string | null,"purchase_date"?: string | null,"service_company_id"?: string | null,"supplier_company_id"?: string | null,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"value_cents"?: number | null,"warranty_end"?: string | null
                  }
                  Update: {
                    "category_id"?: string,"condition"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"label_serial"?: string,"location_id"?: string,"maker_serial"?: string | null,"minimum_level"?: number | null,"model_id"?: string | null,"name"?: string,"notes"?: string | null,"photo_path"?: string | null,"purchase_date"?: string | null,"service_company_id"?: string | null,"supplier_company_id"?: string | null,"unit"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"value_cents"?: number | null,"warranty_end"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "item_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_label_serial_fkey"
      columns: ["label_serial"]
isOneToOne: true
      referencedRelation: "labels"
      referencedColumns: ["serial"]
    },{
      foreignKeyName: "items_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_model_id_fkey"
      columns: ["model_id"]
isOneToOne: false
      referencedRelation: "product_models"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_service_company_id_fkey"
      columns: ["service_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_supplier_company_id_fkey"
      columns: ["supplier_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"label_print_runs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"first_number": number,"id": number,"label_count": number | null,"last_number": number,"reprint_of": number | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"first_number"?: number,"id"?: never,"label_count"?: never,"last_number"?: number,"reprint_of"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"first_number"?: number,"id"?: never,"label_count"?: never,"last_number"?: number,"reprint_of"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "label_print_runs_reprint_of_fkey"
      columns: ["reprint_of"]
isOneToOne: false
      referencedRelation: "label_print_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"labels": {
                  Row: {
                    "created_at": string,"created_by": string | null,"serial": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"serial"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"serial"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"library_books": {
                  Row: {
                    "active": boolean,"author": string | null,"created_at": string,"created_by": string | null,"entered_by": string,"id": string,"isbn": string | null,"language": string,"published_year": number | null,"publisher": string | null,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"author"?: string | null,"created_at"?: string,"created_by"?: string | null,"entered_by"?: string,"id"?: string,"isbn"?: string | null,"language"?: string,"published_year"?: number | null,"publisher"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"author"?: string | null,"created_at"?: string,"created_by"?: string | null,"entered_by"?: string,"id"?: string,"isbn"?: string | null,"language"?: string,"published_year"?: number | null,"publisher"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"library_borrowers": {
                  Row: {
                    "active": boolean,"contact": string,"contact_kind": string,"created_at": string,"created_by": string | null,"full_name": string,"id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"contact"?: string,"contact_kind"?: string,"created_at"?: string,"created_by"?: string | null,"full_name"?: string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"contact"?: string,"contact_kind"?: string,"created_at"?: string,"created_by"?: string | null,"full_name"?: string,"id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"library_copies": {
                  Row: {
                    "book_id": string,"copy_note": string | null,"created_at": string,"created_by": string | null,"id": string,"label_serial": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "book_id"?: string,"copy_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"label_serial"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "book_id"?: string,"copy_note"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"label_serial"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "library_copies_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "library_book_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_copies_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "library_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_copies_label_serial_fkey"
      columns: ["label_serial"]
isOneToOne: true
      referencedRelation: "labels"
      referencedColumns: ["serial"]
    }
                  ]
                },"library_copy_entries": {
                  Row: {
                    "copy_id": string,"created_at": string,"created_by": string | null,"happened_on": string,"id": number,"kind": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "copy_id"?: string,"created_at"?: string,"created_by"?: string | null,"happened_on"?: string,"id"?: never,"kind"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "copy_id"?: string,"created_at"?: string,"created_by"?: string | null,"happened_on"?: string,"id"?: never,"kind"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "library_copy_entries_copy_id_fkey"
      columns: ["copy_id"]
isOneToOne: false
      referencedRelation: "library_copies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_copy_entries_copy_id_fkey"
      columns: ["copy_id"]
isOneToOne: false
      referencedRelation: "library_copy_list"
      referencedColumns: ["id"]
    }
                  ]
                },"library_loan_entries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"happened_on": string,"id": number,"kind": string,"loan_id": number,"new_due_on": string | null,"undoes_entry_id": number | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"happened_on"?: string,"id"?: never,"kind"?: string,"loan_id"?: number,"new_due_on"?: string | null,"undoes_entry_id"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"happened_on"?: string,"id"?: never,"kind"?: string,"loan_id"?: number,"new_due_on"?: string | null,"undoes_entry_id"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "library_loan_entries_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "library_copy_list"
      referencedColumns: ["loan_id"]
    },{
      foreignKeyName: "library_loan_entries_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "library_loan_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_loan_entries_loan_id_fkey"
      columns: ["loan_id"]
isOneToOne: false
      referencedRelation: "library_loans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_loan_entries_undoes_entry_id_fkey"
      columns: ["undoes_entry_id"]
isOneToOne: true
      referencedRelation: "library_loan_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"library_loans": {
                  Row: {
                    "borrower_id": string,"copy_id": string,"created_at": string,"created_by": string | null,"first_due_on": string,"id": number,"lent_on": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "borrower_id"?: string,"copy_id"?: string,"created_at"?: string,"created_by"?: string | null,"first_due_on"?: string,"id"?: never,"lent_on"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "borrower_id"?: string,"copy_id"?: string,"created_at"?: string,"created_by"?: string | null,"first_due_on"?: string,"id"?: never,"lent_on"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "library_loans_borrower_id_fkey"
      columns: ["borrower_id"]
isOneToOne: false
      referencedRelation: "library_borrowers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_loans_copy_id_fkey"
      columns: ["copy_id"]
isOneToOne: false
      referencedRelation: "library_copies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_loans_copy_id_fkey"
      columns: ["copy_id"]
isOneToOne: false
      referencedRelation: "library_copy_list"
      referencedColumns: ["id"]
    }
                  ]
                },"locations": {
                  Row: {
                    "active": boolean,"code": number,"created_at": string,"created_by": string | null,"id": string,"kind": string,"name": string,"notes": string | null,"parent_id": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"notes"?: string | null,"parent_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"code"?: never,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"name"?: string,"notes"?: string | null,"parent_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "locations_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_ticket_events": {
                  Row: {
                    "asset_event_id": number | null,"company_id": string | null,"company_job_ref": string | null,"cost_cents": number | null,"created_at": string,"created_by": string | null,"id": number,"kind": string,"new_assignee_person_id": string | null,"new_priority": string | null,"new_status": string | null,"note": string | null,"photo_path": string | null,"ticket_id": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_event_id"?: number | null,"company_id"?: string | null,"company_job_ref"?: string | null,"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: never,"kind"?: string,"new_assignee_person_id"?: string | null,"new_priority"?: string | null,"new_status"?: string | null,"note"?: string | null,"photo_path"?: string | null,"ticket_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "asset_event_id"?: number | null,"company_id"?: string | null,"company_job_ref"?: string | null,"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"id"?: never,"kind"?: string,"new_assignee_person_id"?: string | null,"new_priority"?: string | null,"new_status"?: string | null,"note"?: string | null,"photo_path"?: string | null,"ticket_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_ticket_events_asset_event_id_fkey"
      columns: ["asset_event_id"]
isOneToOne: true
      referencedRelation: "asset_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_ticket_events_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_ticket_events_new_assignee_person_id_fkey"
      columns: ["new_assignee_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_ticket_events_new_assignee_person_id_fkey"
      columns: ["new_assignee_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_ticket_events_new_assignee_person_id_fkey"
      columns: ["new_assignee_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_ticket_events_new_assignee_person_id_fkey"
      columns: ["new_assignee_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_ticket_events_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "maintenance_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"maintenance_tickets": {
                  Row: {
                    "asset_event_id": number | null,"assigned_person_id": string | null,"closed_at": string | null,"closing_note": string | null,"cost_cents": number | null,"created_at": string,"created_by": string | null,"description": string,"id": number,"item_id": string | null,"location_id": string,"photo_path": string | null,"priority": string,"reported_by": string | null,"reported_by_person_id": string | null,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_event_id"?: number | null,"assigned_person_id"?: string | null,"closed_at"?: string | null,"closing_note"?: string | null,"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: never,"item_id"?: string | null,"location_id"?: string,"photo_path"?: string | null,"priority"?: string,"reported_by"?: string | null,"reported_by_person_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "asset_event_id"?: number | null,"assigned_person_id"?: string | null,"closed_at"?: string | null,"closing_note"?: string | null,"cost_cents"?: number | null,"created_at"?: string,"created_by"?: string | null,"description"?: string,"id"?: never,"item_id"?: string | null,"location_id"?: string,"photo_path"?: string | null,"priority"?: string,"reported_by"?: string | null,"reported_by_person_id"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "maintenance_tickets_asset_event_id_fkey"
      columns: ["asset_event_id"]
isOneToOne: true
      referencedRelation: "asset_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_tickets_assigned_person_id_fkey"
      columns: ["assigned_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_tickets_assigned_person_id_fkey"
      columns: ["assigned_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_tickets_assigned_person_id_fkey"
      columns: ["assigned_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_tickets_assigned_person_id_fkey"
      columns: ["assigned_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_tickets_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "maintenance_tickets_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_tickets_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "maintenance_tickets_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_tickets_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "maintenance_tickets_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_tickets_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "maintenance_tickets_reported_by_person_id_fkey"
      columns: ["reported_by_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                },"people": {
                  Row: {
                    "active": boolean,"app_user_id": string | null,"created_at": string,"created_by": string | null,"email": string | null,"full_name": string,"id": string,"person_role_id": string,"phone": string | null,"same_name_confirmed": boolean,"section_id": string,"start_date": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"app_user_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"person_role_id"?: string,"phone"?: string | null,"same_name_confirmed"?: boolean,"section_id"?: string,"start_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"app_user_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"full_name"?: string,"id"?: string,"person_role_id"?: string,"phone"?: string | null,"same_name_confirmed"?: boolean,"section_id"?: string,"start_date"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_app_user_id_fkey"
      columns: ["app_user_id"]
isOneToOne: true
      referencedRelation: "app_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_person_role_id_fkey"
      columns: ["person_role_id"]
isOneToOne: false
      referencedRelation: "person_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id"]
    }
                  ]
                },"person_roles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"name": string,"needs_vetting": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"needs_vetting"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"needs_vetting"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"policies": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"owner_person_id": string,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"owner_person_id"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"owner_person_id"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                },"policy_required_roles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"person_role_id": string,"policy_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"person_role_id"?: string,"policy_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"person_role_id"?: string,"policy_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_required_roles_person_role_id_fkey"
      columns: ["person_role_id"]
isOneToOne: false
      referencedRelation: "person_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_required_roles_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_required_roles_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_required_roles_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["policy_id"]
    }
                  ]
                },"policy_signoffs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"person_id": string,"policy_version_id": string,"scan_path": string | null,"signed_on": string,"updated_at": string,"updated_by": string | null,"withdrawn_at": string | null,"withdrawn_by": string | null,"withdrawn_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"person_id"?: string,"policy_version_id"?: string,"scan_path"?: string | null,"signed_on"?: string,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"person_id"?: string,"policy_version_id"?: string,"scan_path"?: string | null,"signed_on"?: string,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_signoffs_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_signoffs_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "policy_signoffs_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "policy_signoffs_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "policy_signoffs_policy_version_id_fkey"
      columns: ["policy_version_id"]
isOneToOne: false
      referencedRelation: "policies_overview"
      referencedColumns: ["current_version_id"]
    },{
      foreignKeyName: "policy_signoffs_policy_version_id_fkey"
      columns: ["policy_version_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["policy_version_id"]
    },{
      foreignKeyName: "policy_signoffs_policy_version_id_fkey"
      columns: ["policy_version_id"]
isOneToOne: false
      referencedRelation: "policy_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"policy_versions": {
                  Row: {
                    "approved_on": string,"created_at": string,"created_by": string | null,"file_path": string,"id": string,"next_review_on": string,"policy_id": string,"published_at": string | null,"published_by": string | null,"status": string,"updated_at": string,"updated_by": string | null,"version_label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_on"?: string,"created_at"?: string,"created_by"?: string | null,"file_path"?: string,"id"?: string,"next_review_on"?: string,"policy_id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version_label"?: string
                  }
                  Update: {
                    "approved_on"?: string,"created_at"?: string,"created_by"?: string | null,"file_path"?: string,"id"?: string,"next_review_on"?: string,"policy_id"?: string,"published_at"?: string | null,"published_by"?: string | null,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"version_label"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "policy_versions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_versions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policies_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policy_versions_policy_id_fkey"
      columns: ["policy_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["policy_id"]
    }
                  ]
                },"prayer_times": {
                  Row: {
                    "asr": string,"created_at": string,"created_by": string | null,"dhuhr": string,"fajr": string,"id": number,"isha": string,"jumuah_1": string | null,"jumuah_2": string | null,"maghrib": string,"prayer_date": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asr"?: string,"created_at"?: string,"created_by"?: string | null,"dhuhr"?: string,"fajr"?: string,"id"?: never,"isha"?: string,"jumuah_1"?: string | null,"jumuah_2"?: string | null,"maghrib"?: string,"prayer_date"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "asr"?: string,"created_at"?: string,"created_by"?: string | null,"dhuhr"?: string,"fajr"?: string,"id"?: never,"isha"?: string,"jumuah_1"?: string | null,"jumuah_2"?: string | null,"maghrib"?: string,"prayer_date"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"product_models": {
                  Row: {
                    "active": boolean,"category_id": string,"created_at": string,"created_by": string | null,"id": string,"maker_company_id": string,"model_name": string,"notes": string | null,"service_company_id": string | null,"updated_at": string,"updated_by": string | null,"warranty_months": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"maker_company_id"?: string,"model_name"?: string,"notes"?: string | null,"service_company_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"warranty_months"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"maker_company_id"?: string,"model_name"?: string,"notes"?: string | null,"service_company_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"warranty_months"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_models_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "item_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_models_maker_company_id_fkey"
      columns: ["maker_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_models_service_company_id_fkey"
      columns: ["service_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_deliveries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"detail": string | null,"id": number,"outcome": string,"recipient_id": string,"run_id": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"detail"?: string | null,"id"?: never,"outcome"?: string,"recipient_id"?: string,"run_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"detail"?: string | null,"id"?: never,"outcome"?: string,"recipient_id"?: string,"run_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_deliveries_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "app_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_deliveries_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "reminder_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_retries": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"recipient_id": string,"run_id": number,"sent_id": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"recipient_id"?: string,"run_id"?: number,"sent_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"recipient_id"?: string,"run_id"?: number,"sent_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_retries_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "app_users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_retries_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "reminder_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reminder_retries_sent_id_fkey"
      columns: ["sent_id"]
isOneToOne: false
      referencedRelation: "reminders_sent"
      referencedColumns: ["id"]
    }
                  ]
                },"reminder_runs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"run_on": string,"trigger": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"run_on"?: string,"trigger"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"run_on"?: string,"trigger"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"reminders_sent": {
                  Row: {
                    "category": string,"created_at": string,"created_by": string | null,"due_on": string,"email_title": string,"id": number,"record_id": string,"run_id": number,"source": string,"stage": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"due_on"?: string,"email_title"?: string,"id"?: never,"record_id"?: string,"run_id"?: number,"source"?: string,"stage"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"created_by"?: string | null,"due_on"?: string,"email_title"?: string,"id"?: never,"record_id"?: string,"run_id"?: number,"source"?: string,"stage"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_sent_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "reminder_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"renewal_dates": {
                  Row: {
                    "created_at": string,"created_by": string | null,"due_on": string,"id": number,"renewal_id": string,"renewed_on": string | null,"updated_at": string,"updated_by": string | null,"withdrawn_at": string | null,"withdrawn_by": string | null,"withdrawn_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"due_on"?: string,"id"?: never,"renewal_id"?: string,"renewed_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"due_on"?: string,"id"?: never,"renewal_id"?: string,"renewed_on"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "renewal_dates_renewal_id_fkey"
      columns: ["renewal_id"]
isOneToOne: false
      referencedRelation: "renewals"
      referencedColumns: ["id"]
    }
                  ]
                },"renewals": {
                  Row: {
                    "active": boolean,"category": string,"created_at": string,"created_by": string | null,"documents_needed": string | null,"id": string,"notes": string | null,"owner_person_id": string | null,"title": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"category"?: string,"created_at"?: string,"created_by"?: string | null,"documents_needed"?: string | null,"id"?: string,"notes"?: string | null,"owner_person_id"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"category"?: string,"created_at"?: string,"created_by"?: string | null,"documents_needed"?: string | null,"id"?: string,"notes"?: string | null,"owner_person_id"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "renewals_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "renewals_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "renewals_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "renewals_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"created_by": string | null,"description": string | null,"label": string,"sign_in_method": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"label"?: string,"sign_in_method"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"label"?: string,"sign_in_method"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rota_assignments": {
                  Row: {
                    "assignment_date": string,"created_at": string,"created_by": string | null,"end_time": string | null,"id": number,"location_id": string | null,"note": string | null,"person_id": string | null,"removed_at": string | null,"removed_by": string | null,"replaces_id": number | null,"slot_type_id": string,"start_time": string | null,"updated_at": string,"updated_by": string | null,"week_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_date"?: string,"created_at"?: string,"created_by"?: string | null,"end_time"?: string | null,"id"?: never,"location_id"?: string | null,"note"?: string | null,"person_id"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"replaces_id"?: number | null,"slot_type_id"?: string,"start_time"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"week_id"?: string
                  }
                  Update: {
                    "assignment_date"?: string,"created_at"?: string,"created_by"?: string | null,"end_time"?: string | null,"id"?: never,"location_id"?: string | null,"note"?: string | null,"person_id"?: string | null,"removed_at"?: string | null,"removed_by"?: string | null,"replaces_id"?: number | null,"slot_type_id"?: string,"start_time"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"week_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rota_assignments_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "rota_assignments_replaces_id_fkey"
      columns: ["replaces_id"]
isOneToOne: true
      referencedRelation: "rota_assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_replaces_id_fkey"
      columns: ["replaces_id"]
isOneToOne: true
      referencedRelation: "rota_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_slot_type_id_fkey"
      columns: ["slot_type_id"]
isOneToOne: false
      referencedRelation: "rota_slot_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_changes"
      referencedColumns: ["week_id"]
    },{
      foreignKeyName: "rota_assignments_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_weeks"
      referencedColumns: ["id"]
    }
                  ]
                },"rota_publications": {
                  Row: {
                    "change_count": number,"created_at": string,"created_by": string | null,"frozen_copy": NonNullable<Json>,"id": number,"published_at": string,"published_by": string,"seen_warnings": boolean,"updated_at": string,"updated_by": string | null,"warning_count": number,"week_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "change_count"?: number,"created_at"?: string,"created_by"?: string | null,"frozen_copy"?: NonNullable<Json>,"id"?: never,"published_at"?: string,"published_by"?: string,"seen_warnings"?: boolean,"updated_at"?: string,"updated_by"?: string | null,"warning_count"?: number,"week_id"?: string
                  }
                  Update: {
                    "change_count"?: number,"created_at"?: string,"created_by"?: string | null,"frozen_copy"?: NonNullable<Json>,"id"?: never,"published_at"?: string,"published_by"?: string,"seen_warnings"?: boolean,"updated_at"?: string,"updated_by"?: string | null,"warning_count"?: number,"week_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rota_publications_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_changes"
      referencedColumns: ["week_id"]
    },{
      foreignKeyName: "rota_publications_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_weeks"
      referencedColumns: ["id"]
    }
                  ]
                },"rota_slot_types": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"display_order": number,"id": string,"name": string,"needs_vetting": boolean,"prayer_time": string | null,"slot_group": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_order"?: number,"id"?: string,"name"?: string,"needs_vetting"?: boolean,"prayer_time"?: string | null,"slot_group"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"display_order"?: number,"id"?: string,"name"?: string,"needs_vetting"?: boolean,"prayer_time"?: string | null,"slot_group"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rota_template_slots": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"day_of_week": number | null,"end_time": string | null,"id": number,"location_id": string | null,"note": string | null,"people_count": number,"slot_type_id": string,"start_time": string | null,"template_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"day_of_week"?: number | null,"end_time"?: string | null,"id"?: never,"location_id"?: string | null,"note"?: string | null,"people_count"?: number,"slot_type_id"?: string,"start_time"?: string | null,"template_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"day_of_week"?: number | null,"end_time"?: string | null,"id"?: never,"location_id"?: string | null,"note"?: string | null,"people_count"?: number,"slot_type_id"?: string,"start_time"?: string | null,"template_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "rota_template_slots_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_template_slots_slot_type_id_fkey"
      columns: ["slot_type_id"]
isOneToOne: false
      referencedRelation: "rota_slot_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_template_slots_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "rota_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"rota_template_uses": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"on_day": string | null,"slots_added": number,"template_id": string,"updated_at": string,"updated_by": string | null,"used_at": string,"used_by": string,"week_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"on_day"?: string | null,"slots_added"?: number,"template_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"used_at"?: string,"used_by"?: string,"week_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"on_day"?: string | null,"slots_added"?: number,"template_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"used_at"?: string,"used_by"?: string,"week_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rota_template_uses_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "rota_templates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_template_uses_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_changes"
      referencedColumns: ["week_id"]
    },{
      foreignKeyName: "rota_template_uses_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_weeks"
      referencedColumns: ["id"]
    }
                  ]
                },"rota_templates": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"description": string | null,"display_order": number,"id": string,"kind": string,"name": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"display_order"?: number,"id"?: string,"kind"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"display_order"?: number,"id"?: string,"kind"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"rota_weeks": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"status": string,"updated_at": string,"updated_by": string | null,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"week_start"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"week_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sections": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"name": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"stock_movements": {
                  Row: {
                    "corrects_id": number | null,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"id": number,"item_id": string,"kind": string,"quantity": number,"reason": string | null,"status": string,"stocktake_difference_id": number | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "corrects_id"?: number | null,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: never,"item_id"?: string,"kind"?: string,"quantity"?: number,"reason"?: string | null,"status"?: string,"stocktake_difference_id"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "corrects_id"?: number | null,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"id"?: never,"item_id"?: string,"kind"?: string,"quantity"?: number,"reason"?: string | null,"status"?: string,"stocktake_difference_id"?: number | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_movements_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "stock_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_movements_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_movements_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stock_movements_stocktake_difference_id_fkey"
      columns: ["stocktake_difference_id"]
isOneToOne: false
      referencedRelation: "stocktake_differences"
      referencedColumns: ["id"]
    }
                  ]
                },"stocktake_differences": {
                  Row: {
                    "created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"decision_note": string | null,"expected_location_id": string | null,"expected_quantity": number | null,"found_condition": string | null,"found_quantity": number | null,"id": number,"item_id": string,"kind": string,"status": string,"stocktake_id": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"expected_location_id"?: string | null,"expected_quantity"?: number | null,"found_condition"?: string | null,"found_quantity"?: number | null,"id"?: never,"item_id"?: string,"kind"?: string,"status"?: string,"stocktake_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"decision_note"?: string | null,"expected_location_id"?: string | null,"expected_quantity"?: number | null,"found_condition"?: string | null,"found_quantity"?: number | null,"id"?: never,"item_id"?: string,"kind"?: string,"status"?: string,"stocktake_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stocktake_differences_expected_location_id_fkey"
      columns: ["expected_location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stocktake_differences_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stocktake_differences_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stocktake_differences_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stocktake_differences_stocktake_id_fkey"
      columns: ["stocktake_id"]
isOneToOne: false
      referencedRelation: "stocktakes"
      referencedColumns: ["id"]
    }
                  ]
                },"stocktake_scans": {
                  Row: {
                    "created_at": string,"created_by": string | null,"found_quantity": number | null,"id": number,"item_id": string | null,"label_serial": string,"stocktake_id": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"found_quantity"?: number | null,"id"?: never,"item_id"?: string | null,"label_serial"?: string,"stocktake_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"found_quantity"?: number | null,"id"?: never,"item_id"?: string | null,"label_serial"?: string,"stocktake_id"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stocktake_scans_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stocktake_scans_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stocktake_scans_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "stocktake_scans_label_serial_fkey"
      columns: ["label_serial"]
isOneToOne: false
      referencedRelation: "labels"
      referencedColumns: ["serial"]
    },{
      foreignKeyName: "stocktake_scans_stocktake_id_fkey"
      columns: ["stocktake_id"]
isOneToOne: false
      referencedRelation: "stocktakes"
      referencedColumns: ["id"]
    }
                  ]
                },"stocktakes": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"location_id": string,"status": string,"submitted_at": string | null,"submitted_by": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"location_id"?: string,"status"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"location_id"?: string,"status"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "stocktakes_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"training_records": {
                  Row: {
                    "completed_on": string,"created_at": string,"created_by": string | null,"expires_on": string | null,"id": number,"person_id": string,"training_type_id": string,"updated_at": string,"updated_by": string | null,"withdrawn_at": string | null,"withdrawn_by": string | null,"withdrawn_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_on"?: string,"created_at"?: string,"created_by"?: string | null,"expires_on"?: string | null,"id"?: never,"person_id"?: string,"training_type_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Update: {
                    "completed_on"?: string,"created_at"?: string,"created_by"?: string | null,"expires_on"?: string | null,"id"?: never,"person_id"?: string,"training_type_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "training_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "training_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "training_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "training_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "training_records_training_type_id_fkey"
      columns: ["training_type_id"]
isOneToOne: false
      referencedRelation: "training_types"
      referencedColumns: ["id"]
    }
                  ]
                },"training_types": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"name": string,"updated_at": string,"updated_by": string | null,"usual_years": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null,"usual_years"?: number | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"updated_at"?: string,"updated_by"?: string | null,"usual_years"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"vehicle_renewals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": number,"kind": string,"renewed_on": string,"updated_at": string,"updated_by": string | null,"valid_until": string,"vehicle_id": string,"withdrawn_at": string | null,"withdrawn_by": string | null,"withdrawn_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"kind"?: string,"renewed_on"?: string,"updated_at"?: string,"updated_by"?: string | null,"valid_until"?: string,"vehicle_id"?: string,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: never,"kind"?: string,"renewed_on"?: string,"updated_at"?: string,"updated_by"?: string | null,"valid_until"?: string,"vehicle_id"?: string,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicle_renewals_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicle_status"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicle_renewals_vehicle_id_fkey"
      columns: ["vehicle_id"]
isOneToOne: false
      referencedRelation: "vehicles"
      referencedColumns: ["id"]
    }
                  ]
                },"vehicles": {
                  Row: {
                    "active": boolean,"created_at": string,"created_by": string | null,"id": string,"item_id": string,"keeper_person_id": string | null,"make_model": string | null,"nct_needed": boolean,"registration": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"keeper_person_id"?: string | null,"make_model"?: string | null,"nct_needed"?: boolean,"registration"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"keeper_person_id"?: string | null,"make_model"?: string | null,"nct_needed"?: boolean,"registration"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehicles_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "vehicles_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                },"vetting_records": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expires_on": string | null,"happened_on": string,"id": number,"kind": string,"person_id": string,"updated_at": string,"updated_by": string | null,"withdrawn_at": string | null,"withdrawn_by": string | null,"withdrawn_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expires_on"?: string | null,"happened_on"?: string,"id"?: never,"kind"?: string,"person_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expires_on"?: string | null,"happened_on"?: string,"id"?: never,"kind"?: string,"person_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"withdrawn_at"?: string | null,"withdrawn_by"?: string | null,"withdrawn_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "vetting_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vetting_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "vetting_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "vetting_records_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                }
          }
          Views: {
            "asset_last_seen": {
                  Row: {
                    "category_id": string,"condition": string | null,"item_id": string,"label_serial": string,"last_seen_at": string | null,"last_seen_how": string | null,"location_id": string,"name": string,"value_cents": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "items_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "item_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_label_serial_fkey"
      columns: ["label_serial"]
isOneToOne: true
      referencedRelation: "labels"
      referencedColumns: ["serial"]
    },{
      foreignKeyName: "items_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_claim_list": {
                  Row: {
                    "amount_cents": number,"approved_at": string | null,"category_id": string,"closed_at": string | null,"closed_by": string | null,"closed_note": string | null,"copied_from_id": number | null,"correction_id": number | null,"correction_reason": string | null,"corrects_id": number | null,"created_at": string,"created_by": string | null,"current_amount_cents": number | null,"current_category_id": string | null,"current_fund_id": string | null,"current_receipt_date": string | null,"current_vat_cents": number | null,"description": string,"file_count": number | null,"first_at": string | null,"first_by": string | null,"first_fund_id": string | null,"fund_id": string | null,"id": number,"kind": string,"needs_second": boolean | null,"owed_cents": number | null,"paid_by_person_id": string | null,"paid_to_company_id": string | null,"paid_to_text": string | null,"payment": string,"receipt_date": string,"receipt_lost_reason": string | null,"repaid_cents": number | null,"second_at": string | null,"second_by": string | null,"second_fund_id": string | null,"state": string | null,"suggested_fund_id": string | null,"ticket_id": number | null,"updated_at": string,"updated_by": string | null,"vat_cents": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "expense_claims_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "expense_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_to_company_id_fkey"
      columns: ["paid_to_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_suggested_fund_id_fkey"
      columns: ["suggested_fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "maintenance_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_decisions_fund_id_fkey"
      columns: ["first_fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_decisions_fund_id_fkey"
      columns: ["second_fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_entries": {
                  Row: {
                    "amount_cents": number,"approved_at": string | null,"category_id": string,"closed_at": string | null,"closed_by": string | null,"closed_note": string | null,"copied_from_id": number | null,"correction_reason": string | null,"corrects_id": number | null,"created_at": string,"created_by": string | null,"description": string,"first_at": string | null,"first_by": string | null,"first_fund_id": string | null,"fund_id": string | null,"id": number,"kind": string,"needs_second": boolean | null,"paid_by_person_id": string | null,"paid_to_company_id": string | null,"paid_to_text": string | null,"payment": string,"receipt_date": string,"receipt_lost_reason": string | null,"second_at": string | null,"second_by": string | null,"second_fund_id": string | null,"state": string | null,"suggested_fund_id": string | null,"ticket_id": number | null,"updated_at": string,"updated_by": string | null,"vat_cents": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "expense_claims_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "expense_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_copied_from_id_fkey"
      columns: ["copied_from_id"]
isOneToOne: true
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["correction_id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claim_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_claims"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_corrects_id_fkey"
      columns: ["corrects_id"]
isOneToOne: false
      referencedRelation: "expense_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_by_person_id_fkey"
      columns: ["paid_by_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "expense_claims_paid_to_company_id_fkey"
      columns: ["paid_to_company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_suggested_fund_id_fkey"
      columns: ["suggested_fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_claims_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "maintenance_tickets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_decisions_fund_id_fkey"
      columns: ["first_fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_decisions_fund_id_fkey"
      columns: ["second_fund_id"]
isOneToOne: false
      referencedRelation: "expense_funds"
      referencedColumns: ["id"]
    }
                  ]
                },"library_book_list": {
                  Row: {
                    "active": boolean,"author": string | null,"copies": number | null,"created_at": string,"id": string,"isbn": string | null,"language": string,"published_year": number | null,"publisher": string | null,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                           "active"?: boolean | null,"author"?: string | null,"copies"?: never,"created_at"?: string | null,"id"?: string | null,"isbn"?: string | null,"language"?: string | null,"published_year"?: number | null,"publisher"?: string | null,"title"?: string | null
                         }
                        Update: {
                           "active"?: boolean | null,"author"?: string | null,"copies"?: never,"created_at"?: string | null,"id"?: string | null,"isbn"?: string | null,"language"?: string | null,"published_year"?: number | null,"publisher"?: string | null,"title"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"library_copy_list": {
                  Row: {
                    "author": string | null,"book_active": boolean,"book_id": string,"borrower_id": string | null,"days_overdue": number | null,"due_on": string | null,"flagged_on": string | null,"id": string,"label_serial": string,"language": string,"lent_on": string | null,"loan_id": number | null,"status": string | null,"title": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "library_copies_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "library_book_list"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_copies_book_id_fkey"
      columns: ["book_id"]
isOneToOne: false
      referencedRelation: "library_books"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_copies_label_serial_fkey"
      columns: ["label_serial"]
isOneToOne: true
      referencedRelation: "labels"
      referencedColumns: ["serial"]
    },{
      foreignKeyName: "library_loans_borrower_id_fkey"
      columns: ["borrower_id"]
isOneToOne: false
      referencedRelation: "library_borrowers"
      referencedColumns: ["id"]
    }
                  ]
                },"library_loan_status": {
                  Row: {
                    "borrower_id": string,"copy_id": string,"created_at": string,"days_late": number | null,"days_overdue": number | null,"due_on": string | null,"first_due_on": string,"id": number,"is_open": boolean | null,"lent_by": string | null,"lent_on": string,"lost_on": string | null,"returned_on": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "library_loans_borrower_id_fkey"
      columns: ["borrower_id"]
isOneToOne: false
      referencedRelation: "library_borrowers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_loans_copy_id_fkey"
      columns: ["copy_id"]
isOneToOne: false
      referencedRelation: "library_copies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "library_loans_copy_id_fkey"
      columns: ["copy_id"]
isOneToOne: false
      referencedRelation: "library_copy_list"
      referencedColumns: ["id"]
    }
                  ]
                },"people_training": {
                  Row: {
                    "active": boolean,"completed_on": string,"expires_on": string | null,"full_name": string,"person_id": string,"person_role_id": string,"section_id": string,"status": string | null,"training_type_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "people_person_role_id_fkey"
      columns: ["person_role_id"]
isOneToOne: false
      referencedRelation: "person_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "training_records_training_type_id_fkey"
      columns: ["training_type_id"]
isOneToOne: false
      referencedRelation: "training_types"
      referencedColumns: ["id"]
    }
                  ]
                },"people_vetting": {
                  Row: {
                    "active": boolean,"applied_on": string | null,"expires_on": string | null,"full_name": string,"needs_vetting": boolean,"person_id": string,"person_role_id": string,"section_id": string,"status": string | null,"vetted_on": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "people_person_role_id_fkey"
      columns: ["person_role_id"]
isOneToOne: false
      referencedRelation: "person_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id"]
    }
                  ]
                },"policies_overview": {
                  Row: {
                    "active": boolean,"approved_on": string | null,"current_label": string | null,"current_version_id": string | null,"has_draft": boolean | null,"id": string,"must_sign": number | null,"next_review_on": string | null,"owner_person_id": string,"published_at": string | null,"review_status": string | null,"title": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "policies_owner_person_id_fkey"
      columns: ["owner_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                },"policy_grid": {
                  Row: {
                    "full_name": string,"person_id": string,"person_role_id": string,"policy_id": string,"policy_version_id": string,"published_on": string | null,"section_id": string,"signed_on": string | null,"status": string | null,"title": string,"version_label": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "people_person_role_id_fkey"
      columns: ["person_role_id"]
isOneToOne: false
      referencedRelation: "person_roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_section_id_fkey"
      columns: ["section_id"]
isOneToOne: false
      referencedRelation: "sections"
      referencedColumns: ["id"]
    }
                  ]
                },"renewals_register": {
                  Row: {
                    "category": string | null,"due_on": string | null,"note": string | null,"owner_person_id": string | null,"record_id": string | null,"source": string | null,"status": string | null,"title": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"rota_changes": {
                  Row: {
                    "assignment_id": number | null,"kind": string | null,"week_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"rota_entries": {
                  Row: {
                    "assignment_date": string,"created_at": string,"end_min": number | null,"ends_at": string | null,"id": number,"location_id": string | null,"note": string | null,"person_id": string | null,"prayer_time": string | null,"replaces_id": number | null,"slot_group": string,"slot_type_id": string,"start_min": number | null,"starts_at": string | null,"week_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "rota_assignments_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "rota_assignments_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "rota_assignments_replaces_id_fkey"
      columns: ["replaces_id"]
isOneToOne: true
      referencedRelation: "rota_assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_replaces_id_fkey"
      columns: ["replaces_id"]
isOneToOne: true
      referencedRelation: "rota_entries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_slot_type_id_fkey"
      columns: ["slot_type_id"]
isOneToOne: false
      referencedRelation: "rota_slot_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rota_assignments_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_changes"
      referencedColumns: ["week_id"]
    },{
      foreignKeyName: "rota_assignments_week_id_fkey"
      columns: ["week_id"]
isOneToOne: false
      referencedRelation: "rota_weeks"
      referencedColumns: ["id"]
    }
                  ]
                },"rota_warnings": {
                  Row: {
                    "assignment_date": string | null,"assignment_id": number | null,"kind": string | null,"other_assignment_id": number | null,"person_id": string | null,"vetting": string | null,"week_id": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"stock_levels": {
                  Row: {
                    "item_id": string,"label_serial": string,"last_counted_at": string | null,"location_id": string,"minimum_level": number | null,"name": string,"previous_counted_at": string | null,"quantity": number | null,"status": string | null,"unit": string | null,"usage_since_previous_count": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "items_label_serial_fkey"
      columns: ["label_serial"]
isOneToOne: true
      referencedRelation: "labels"
      referencedColumns: ["serial"]
    },{
      foreignKeyName: "items_location_id_fkey"
      columns: ["location_id"]
isOneToOne: false
      referencedRelation: "locations"
      referencedColumns: ["id"]
    }
                  ]
                },"vehicle_status": {
                  Row: {
                    "active": boolean,"condition": string | null,"id": string,"insurance_status": string | null,"insurance_until": string | null,"item_id": string,"item_name": string,"keeper_person_id": string | null,"label_serial": string,"make_model": string | null,"nct_needed": boolean,"nct_status": string | null,"nct_until": string | null,"registration": string,"tax_status": string | null,"tax_until": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "items_label_serial_fkey"
      columns: ["label_serial"]
isOneToOne: true
      referencedRelation: "labels"
      referencedColumns: ["serial"]
    },{
      foreignKeyName: "vehicles_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "asset_last_seen"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "vehicles_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "stock_levels"
      referencedColumns: ["item_id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "people_training"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "people_vetting"
      referencedColumns: ["person_id"]
    },{
      foreignKeyName: "vehicles_keeper_person_id_fkey"
      columns: ["keeper_person_id"]
isOneToOne: false
      referencedRelation: "policy_grid"
      referencedColumns: ["person_id"]
    }
                  ]
                }
          }
          Functions: {
            "add_book_and_copy":
{ Args: { "p_author": string | null,"p_copy_note": string | null,"p_entered_by"?: string | null,"p_isbn": string | null,"p_label": string | null,"p_language": string | null,"p_publisher": string | null,"p_title": string | null,"p_year": number | null }; Returns: Json
                           },
"add_renewal":
{ Args: { "p_category": string | null,"p_documents_needed": string | null,"p_due_on": string | null,"p_notes": string | null,"p_owner_person_id": string | null,"p_title": string | null }; Returns: string
                           },
"asset_register_names":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"id": string,"kind": string,"name": string,"parent_id": string,"place_kind": string
            }[]
                           },
"asset_register_rows":
{ Args: { "p_place"?: string | null }; Returns: {
              "category_id": string,"condition": string,"id": string,"label_serial": string,"location_id": string,"name": string,"purchase_date": string,"value_cents": number,"warranty_end": string
            }[]
                           },
"assign_rota_person":
{ Args: { "p_assignment_id": number | null,"p_person_id": string | null }; Returns: number
                           },
"board_report":
{ Args: { "p_month": string | null }; Returns: Json
                           },
"category_counts":
{ Args: { "p_place"?: string | null }; Returns: {
              "category_id": string,"missing": number,"not_working": number,"stock_lines": number,"stock_low": number,"stock_out": number,"total": number,"with_open_tickets": number,"working": number
            }[]
                           },
"close_maintenance_ticket":
{ Args: { "p_cost_cents"?: number | null,"p_note": string | null,"p_repaired_condition"?: string | null,"p_ticket_id": number | null }; Returns: number
                           },
"enter_expense_claim":
{ Args: { "p_amount_cents": number | null,"p_category_id": string | null,"p_copied_from_id"?: number | null,"p_correction_reason"?: string | null,"p_corrects_id"?: number | null,"p_description": string | null,"p_files"?: (string)[] | null,"p_paid_by_person_id"?: string | null,"p_paid_to_company_id"?: string | null,"p_paid_to_text"?: string | null,"p_payment": string | null,"p_receipt_date": string | null,"p_receipt_lost_reason"?: string | null,"p_suggested_fund_id"?: string | null,"p_ticket_id"?: number | null,"p_vat_cents"?: number | null }; Returns: number
                           },
"expense_companies":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"id": string,"name": string
            }[]
                           },
"expense_counters":
{ Args: Record<PropertyKey, never>; Returns: {
              "for_me": number,"linked": boolean,"owed_cents": number,"owed_people": number,"waiting": number
            }[]
                           },
"expense_list_entries_used":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string
            }[]
                           },
"expense_people":
{ Args: Record<PropertyKey, never>; Returns: {
              "active": boolean,"full_name": string,"has_account": boolean,"id": string,"is_me": boolean
            }[]
                           },
"expense_tickets":
{ Args: Record<PropertyKey, never>; Returns: {
              "closed_at": string,"cost_cents": number,"description": string,"id": number,"status": string
            }[]
                           },
"home_counters":
{ Args: Record<PropertyKey, never>; Returns: {
              "corrections_for_me": number,"damaged": number,"disposals_for_me": number,"low_stock": number,"missing": number,"out_of_stock": number,"renewals_due_30": number,"renewals_overdue": number,"rota_today": number,"rota_today_unfilled": number,"signoffs_overdue": number,"signoffs_unsigned": number,"stocktake_diffs_for_me": number,"tickets_open": number,"tickets_urgent": number,"vetting_due": number,"vetting_expired": number,"vetting_none": number
            }[]
                           },
"item_history":
{ Args: { "p_item_id": string | null }; Returns: {
              "action": string,"changed_at": string,"changed_by_name": string,"id": number,"new_values": Json,"old_values": Json
            }[]
                           },
"label_use":
{ Args: { "p_serial": string | null }; Returns: Json
                           },
"lend_copy":
{ Args: { "p_borrower_id": string | null,"p_copy_id": string | null,"p_due_on"?: string | null }; Returns: number
                           },
"lend_copy_to_new_borrower":
{ Args: { "p_contact": string | null,"p_contact_kind": string | null,"p_copy_id": string | null,"p_due_on"?: string | null,"p_full_name": string | null }; Returns: Json
                           },
"library_code_allowed":
{ Args: { "p_email": string | null }; Returns: boolean
                           },
"library_counters":
{ Args: Record<PropertyKey, never>; Returns: {
              "books_on_loan": number,"books_overdue": number,"copies_lost": number,"due_soon": number
            }[]
                           },
"library_most_borrowed":
{ Args: { "p_since": string | null,"p_until"?: string | null }; Returns: {
              "author": string,"book_id": string,"loans": number,"title": string
            }[]
                           },
"make_board_report_copy":
{ Args: { "p_month": string | null }; Returns: number
                           },
"mark_copy":
{ Args: { "p_copy_id": string | null,"p_kind": string | null }; Returns: undefined
                           },
"move_due_date":
{ Args: { "p_due_on": string | null,"p_loan_id": number | null }; Returns: undefined
                           },
"move_rota_slot_type":
{ Args: { "p_direction": string | null,"p_id": string | null }; Returns: undefined
                           },
"my_expense_link":
{ Args: Record<PropertyKey, never>; Returns: {
              "linked": boolean,"person_name": string
            }[]
                           },
"print_new_labels":
{ Args: { "p_count": number | null }; Returns: {
              "created_at": string,
"created_by": string | null,
"first_number": number,
"id": number,
"label_count": number | null,
"last_number": number,
"reprint_of": number | null,
"updated_at": string,
"updated_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "label_print_runs"
        isOneToOne: true
        isSetofReturn: false
      } },
"publish_rota_week":
{ Args: { "p_seen_warnings"?: boolean | null,"p_week_id": string | null }; Returns: number
                           },
"record_expense_repayment":
{ Args: { "p_claim_ids": (number)[] | null,"p_method": string | null,"p_paid_on": string | null,"p_reference"?: string | null }; Returns: number
                           },
"record_reminder_deliveries":
{ Args: { "p_key"?: string | null,"p_outcomes": Json | null,"p_run_id": number | null }; Returns: number
                           },
"register_status":
{ Args: { "p_due_on": string | null,"p_is_warranty"?: boolean | null,"p_today": string | null }; Returns: string
                           },
"reminder_stage":
{ Args: { "p_days_left": number | null }; Returns: number
                           },
"renewal_status":
{ Args: { "p_today": string | null,"p_valid_until": string | null }; Returns: string
                           },
"report_problem":
{ Args: { "p_description": string | null,"p_item_id": string | null,"p_location_id": string | null,"p_mark_damaged": boolean | null,"p_photo_path": string | null,"p_priority": string | null,"p_reported_by": string | null,"p_reported_by_person_id": string | null }; Returns: number
                           },
"reprint_labels":
{ Args: { "p_run_id": number | null }; Returns: {
              "created_at": string,
"created_by": string | null,
"first_number": number,
"id": number,
"label_count": number | null,
"last_number": number,
"reprint_of": number | null,
"updated_at": string,
"updated_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "label_print_runs"
        isOneToOne: true
        isSetofReturn: false
      } },
"return_copy":
{ Args: { "p_copy_id": string | null }; Returns: Json
                           },
"run_reminders":
{ Args: { "p_key"?: string | null }; Returns: Json
                           },
"save_prayer_month":
{ Args: { "p_days": Json | null,"p_month": string | null }; Returns: Json
                           },
"security_problems":
{ Args: Record<PropertyKey, never>; Returns: {
              "object_kind": string,"object_name": string,"problem": string
            }[]
                           },
"security_report":
{ Args: Record<PropertyKey, never>; Returns: {
              "audited": boolean,"blocks_delete": boolean,"has_record_columns": boolean,"key_locked": boolean,"rls_enabled": boolean,"table_name": string
            }[]
                           },
"set_reminder_timer_key":
{ Args: { "p_key_hash": string | null }; Returns: undefined
                           },
"signoff_status":
{ Args: { "p_published_on": string | null,"p_signed": boolean | null,"p_today": string | null }; Returns: string
                           },
"stocktake_preview":
{ Args: { "p_stocktake_id": number | null }; Returns: {
              "expected_location_id": string,"expected_quantity": number,"found_quantity": number,"item_id": string,"kind": string
            }[]
                           },
"submit_stocktake":
{ Args: { "p_stocktake_id": number | null }; Returns: {
              "created_at": string,
"created_by": string | null,
"id": number,
"location_id": string,
"status": string,
"submitted_at": string | null,
"submitted_by": string | null,
"updated_at": string,
"updated_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "stocktakes"
        isOneToOne: true
        isSetofReturn: false
      } },
"undo_return":
{ Args: { "p_loan_id": number | null }; Returns: undefined
                           },
"use_rota_template":
{ Args: { "p_day"?: string | null,"p_template_id": string | null,"p_week_id": string | null }; Returns: number
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
  "public": {
          Enums: {
            
          }
        }
} as const
