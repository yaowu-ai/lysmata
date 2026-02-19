-- Add agent_id column to bots for targeting a specific OpenClaw Agent (default: "main")
ALTER TABLE bots ADD COLUMN openclaw_agent_id TEXT NOT NULL DEFAULT 'main';
