-- Migration 4: Multi-agent support
-- Rename openclaw-specific columns to backend-agnostic names
-- Add backend_type column for adapter selection

ALTER TABLE bots RENAME COLUMN openclaw_ws_url TO backend_url;
ALTER TABLE bots RENAME COLUMN openclaw_ws_token TO backend_token;
ALTER TABLE bots RENAME COLUMN openclaw_agent_id TO agent_id;
ALTER TABLE bots ADD COLUMN backend_type TEXT NOT NULL DEFAULT 'openclaw';
