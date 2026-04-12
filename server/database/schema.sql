-- DevClip Sync Server PostgreSQL Schema
-- Multi-tenant architecture for Pro/Enterprise sync
-- Tables: users, organizations, org_members, api_keys, encrypted_clips, encrypted_snippets, encrypted_settings, sync_cursors, audit_log, policies

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations (multi-tenant root)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL, -- URL-friendly identifier
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
    max_seats INTEGER NOT NULL DEFAULT 1,
    license_key TEXT, -- For Enterprise offline/air-gapped validation
    settings JSONB NOT NULL DEFAULT '{}',
    billing_email TEXT,
    -- Enterprise policy endpoint (optional remote policy URL)
    policy_url TEXT,
    policy_signature_secret TEXT, -- For HMAC verification of policy docs
    -- Deletion tracking (soft delete)
    deleted_at TIMESTAMPTZ,
    deleted_by UUID
);

CREATE INDEX idx_orgs_slug ON organizations(slug);
CREATE INDEX idx_orgs_license ON organizations(license_key) WHERE license_key IS NOT NULL;

-- Users (belongs to organization via org_members)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email TEXT UNIQUE NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    password_hash TEXT, -- bcrypt hash, NULL for SSO-only users
    -- Profile
    display_name TEXT,
    avatar_url TEXT,
    -- Sync encryption public key (for E2E device verification)
    sync_public_key TEXT,
    -- Preferences
    preferences JSONB NOT NULL DEFAULT '{}',
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    -- Deletion
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;

-- Organization Members (junction with roles)
CREATE TABLE IF NOT EXISTS org_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    -- Invitations
    invited_by UUID REFERENCES users(id),
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_org_members_user ON org_members(user_id);
CREATE INDEX idx_org_members_active ON org_members(org_id, is_active) WHERE is_active = TRUE;

-- API Keys (for device authentication and server-to-server)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for org-level service keys
    name TEXT NOT NULL, -- descriptive name
    -- Key storage (hashed for lookup, we never store raw keys)
    key_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash of the key
    key_prefix TEXT NOT NULL, -- First 8 chars for identification (e.g., "dc_live_")
    -- Scopes
    scopes TEXT[] NOT NULL DEFAULT '{}', -- 'sync:read', 'sync:write', 'admin', 'audit:read'
    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    last_ip INET,
    usage_count INTEGER NOT NULL DEFAULT 0,
    -- Expiration
    expires_at TIMESTAMPTZ,
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id)
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_org ON api_keys(org_id);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);

-- Encrypted Clips (user's encrypted clipboard history)
CREATE TABLE IF NOT EXISTS encrypted_clips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL, -- For org-level audit
    
    -- Client-side encrypted blob (base64 encoded ciphertext)
    ciphertext TEXT NOT NULL,
    -- Encryption metadata (format version, key derivation params, etc.)
    cipher_meta JSONB NOT NULL DEFAULT '{}',
    
    -- Non-sensitive metadata (for server-side filtering without decryption)
    -- These are set by client but can be used for basic queries
    content_type TEXT, -- 'text', 'image', 'code', 'link'
    content_hint TEXT, -- First 50 chars (optional, client decides what to share)
    size_bytes INTEGER, -- Encrypted blob size
    device_id TEXT, -- Source device identifier (hashed/anon)
    
    -- Sync metadata
    sync_uid TEXT UNIQUE, -- Client-generated UUID for deduplication
    deleted_at TIMESTAMPTZ -- Soft delete for sync tombstones
);

CREATE INDEX idx_clips_user ON encrypted_clips(user_id);
CREATE INDEX idx_clips_user_created ON encrypted_clips(user_id, created_at DESC);
CREATE INDEX idx_clips_sync_uid ON encrypted_clips(sync_uid) WHERE sync_uid IS NOT NULL;
CREATE INDEX idx_clips_updated ON encrypted_clips(updated_at);

-- Encrypted Snippets (code snippets, templates)
CREATE TABLE IF NOT EXISTS encrypted_snippets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    
    -- Encrypted content
    ciphertext TEXT NOT NULL,
    cipher_meta JSONB NOT NULL DEFAULT '{}',
    
    -- Non-sensitive metadata
    snippet_type TEXT DEFAULT 'code', -- 'code', 'text', 'command'
    language TEXT, -- Programming language hint
    title_hint TEXT, -- First 100 chars of title (optional)
    tags TEXT[], -- Searchable tags (plaintext for filtering)
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    
    -- Sync
    sync_uid TEXT UNIQUE,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_snippets_user ON encrypted_snippets(user_id);
CREATE INDEX idx_snippets_user_fav ON encrypted_snippets(user_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_snippets_tags ON encrypted_snippets USING GIN(tags);
CREATE INDEX idx_snippets_sync_uid ON encrypted_snippets(sync_uid) WHERE sync_uid IS NOT NULL;

-- Encrypted Settings (user preferences and app state)
CREATE TABLE IF NOT EXISTS encrypted_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Encrypted settings bundle
    ciphertext TEXT NOT NULL,
    cipher_meta JSONB NOT NULL DEFAULT '{}',
    
    -- Versioning for conflict resolution
    settings_version INTEGER NOT NULL DEFAULT 1,
    device_id TEXT, -- Last device to update
    
    sync_uid TEXT UNIQUE,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_settings_user ON encrypted_settings(user_id);
CREATE INDEX idx_settings_version ON encrypted_settings(user_id, settings_version DESC);

-- Sync Cursors (for efficient delta sync)
CREATE TABLE IF NOT EXISTS sync_cursors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL, -- Device-specific cursor
    
    -- Cursor data (opaque to server, meaningful to client)
    cursor_data JSONB NOT NULL DEFAULT '{}',
    -- Tracks last seen timestamps per content type
    last_clip_at TIMESTAMPTZ,
    last_snippet_at TIMESTAMPTZ,
    last_setting_at TIMESTAMPTZ,
    
    UNIQUE(user_id, device_id)
);

CREATE INDEX idx_cursors_user_device ON sync_cursors(user_id, device_id);

-- Audit Log (HMAC-signed for tamper detection)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Event details
    event_type TEXT NOT NULL, -- 'clip_created', 'snippet_updated', 'sync', 'login', 'policy_change', etc.
    resource_type TEXT, -- 'clip', 'snippet', 'user', 'org', 'policy'
    resource_id UUID,
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    device_id TEXT,
    
    -- Event payload (may include summary, never full encrypted content)
    payload JSONB NOT NULL DEFAULT '{}',
    
    -- Integrity: HMAC-SHA256 signed by server secret
    -- Used to detect tampering in the audit trail
    signature TEXT NOT NULL,
    
    -- Chain: hash of previous audit entry for blockchain-like integrity
    previous_hash TEXT,
    entry_hash TEXT NOT NULL -- Hash of this entry (excluding this field)
);

CREATE INDEX idx_audit_org ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_event ON audit_log(event_type, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);

-- Enterprise Policies (remote policy storage for Enterprise tier)
CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    description TEXT,
    
    -- Policy content (JSON document)
    policy_doc JSONB NOT NULL DEFAULT '{}',
    
    -- Digital signature (HMAC-SHA256 with org secret)
    signature TEXT NOT NULL,
    
    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Activation
    activated_at TIMESTAMPTZ,
    activated_by UUID REFERENCES users(id),
    
    -- Audit
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    UNIQUE(org_id, version)
);

CREATE INDEX idx_policies_org ON policies(org_id);
CREATE INDEX idx_policies_active ON policies(org_id, is_active) WHERE is_active = TRUE;

-- Rate Limiting (token bucket tracking)
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL, -- "api:{hash}" or "user:{user_id}"
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tokens_remaining INTEGER NOT NULL,
    last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limits_key ON rate_limits(key);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start);

-- WebSocket Sync Sessions (for live sync tracking)
CREATE TABLE IF NOT EXISTS sync_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    
    -- Session metadata
    socket_id TEXT NOT NULL, -- WebSocket connection ID
    ip_address INET,
    user_agent TEXT,
    
    -- Status
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    
    UNIQUE(user_id, device_id, socket_id)
);

CREATE INDEX idx_sync_sessions_user ON sync_sessions(user_id);
CREATE INDEX idx_sync_sessions_active ON sync_sessions(disconnected_at) WHERE disconnected_at IS NULL;

-- Migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT
);

-- Insert initial migration record
INSERT INTO schema_migrations (version, description)
VALUES (1, 'Initial schema: organizations, users, org_members, api_keys, encrypted_clips/snippets/settings, sync_cursors, audit_log, policies, rate_limits, sync_sessions')
ON CONFLICT (version) DO NOTHING;

-- Trigger function to update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_orgs_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON org_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clips_updated_at BEFORE UPDATE ON encrypted_clips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_snippets_updated_at BEFORE UPDATE ON encrypted_snippets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON encrypted_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cursors_updated_at BEFORE UPDATE ON sync_cursors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
