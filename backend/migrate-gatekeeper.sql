-- Add gatekeeper field to file_shares table
-- This enables "守门" mode where files show details but disable downloads

ALTER TABLE file_shares ADD COLUMN gatekeeper INTEGER DEFAULT 0 NOT NULL;

-- Update the schema to match boolean mode
-- gatekeeper = 0 (false) - normal sharing mode
-- gatekeeper = 1 (true) - gatekeeper mode (download disabled)
