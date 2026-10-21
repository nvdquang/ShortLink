PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    plan VARCHAR(10) DEFAULT 'free',
    link_limit INTEGER,
    is_verified INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Links (
    id VARCHAR(36) PRIMARY KEY,
    original_url TEXT NOT NULL,
    short_code VARCHAR(15) UNIQUE NOT NULL,
    custom_alias VARCHAR(50) UNIQUE,
    title VARCHAR(255),
    qr_image_url TEXT,
    qr_config JSON,
    click_count INT DEFAULT 0,
    expires_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    user_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_short_code ON Links(short_code);

CREATE TABLE IF NOT EXISTS AuthSessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON AuthSessions(token_hash);

CREATE TABLE IF NOT EXISTS Analytics (
    id VARCHAR(36) PRIMARY KEY,
    link_id VARCHAR(36) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),
    referer VARCHAR(255),
    clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (link_id) REFERENCES Links(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS EmailTokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_tokens_hash ON EmailTokens(token_hash);

CREATE TABLE IF NOT EXISTS SystemSettings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
