ALTER TABLE guide_steps ADD COLUMN software_model TEXT
    CHECK (software_model IS NULL OR (
        step_key = 'forming-first-sale' AND software_model IN ('product', 'client', 'exploring')
    ));
