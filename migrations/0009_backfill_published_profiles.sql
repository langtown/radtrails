-- Migration number: 0009 	 2026-08-18T00:00:00.000Z
-- Preserve approvals that predate the published snapshot table. Persona is a
-- read-time gate, so snapshot every approved row even if it is not public yet.

INSERT INTO published_profiles
    (user_id, slug, display_name, bio, image_key, image_position,
     social_links, published_at)
SELECT user_id, slug, display_name, bio, image_key, image_position,
       social_links, COALESCE(reviewed_at, updated_at, CURRENT_TIMESTAMP)
FROM profiles
WHERE status = 'approved';
