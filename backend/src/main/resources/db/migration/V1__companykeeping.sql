CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE sessions (
    token_hash BYTEA PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    description TEXT NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('forming','operating')),
    demo BOOLEAN NOT NULL,
    setup_complete BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE items (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    filing_order BIGINT GENERATED ALWAYS AS IDENTITY,
    title TEXT NOT NULL,
    why TEXT NOT NULL,
    next_action TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ready','waiting','done')),
    waiting_for TEXT NOT NULL,
    due_date DATE,
    follow_up_date DATE,
    evidence_url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    recurrence TEXT NOT NULL CHECK(recurrence IN ('none','monthly')),
    series_id UUID,
    period TEXT CHECK(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    anchor_day SMALLINT CHECK(anchor_day BETWEEN 1 AND 31),
    completed_at TIMESTAMPTZ,
    UNIQUE(workspace_id, series_id, period),
    CHECK((status = 'done') = (completed_at IS NOT NULL)),
    CHECK(recurrence != 'monthly' OR (series_id IS NOT NULL AND period IS NOT NULL)),
    CHECK(status != 'waiting' OR length(waiting_for) > 0)
);
CREATE INDEX items_workspace_order ON items(workspace_id, filing_order);
