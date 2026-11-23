-- A brief is saved and reopened as a whole document, including the order of its people.
CREATE TABLE notary_briefs (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    draft JSONB NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
    CHECK (draft ?& ARRAY['companyName','registeredOffice','activity','founders','directors',
        'signing','registeredCapitalCzk','contributionAdministrator','paymentSchedule','otherFunding','notes','questions']),
    CHECK (jsonb_typeof(draft->'founders') = 'array' AND jsonb_array_length(draft->'founders') <= 50),
    CHECK (jsonb_typeof(draft->'directors') = 'array' AND jsonb_array_length(draft->'directors') <= 50)
);
