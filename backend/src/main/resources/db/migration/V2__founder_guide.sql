CREATE TABLE guide_steps (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL CHECK (step_key IN (
        'forming-model', 'forming-registration', 'forming-first-sale',
        'operating-money', 'operating-handover', 'operating-review'
    )),
    answer TEXT NOT NULL DEFAULT '' CHECK (char_length(answer) <= 3000),
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    route TEXT CHECK (route IS NULL OR (step_key = 'forming-model' AND route IN ('company', 'individual', 'undecided'))),
    PRIMARY KEY (workspace_id, step_key),
    CHECK (NOT completed OR answer ~ '[^[:space:]]')
);
