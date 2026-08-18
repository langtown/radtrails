-- Migration number: 0005 	 2026-08-18T00:00:00.000Z
-- One pending profile-image upload per user (radtrails-osq.13).
--
-- profile_images is content-addressed and globally deduplicated, so ownership
-- does not belong on the blob row itself. This small association lets a new
-- upload replace only that user's prior unattached upload. Blobs remain while
-- referenced by either a profile or another user's pending upload.

CREATE TABLE profile_image_uploads (
    user_id INTEGER PRIMARY KEY,
    image_key TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (image_key) REFERENCES profile_images(image_key) ON DELETE CASCADE
);

CREATE INDEX profile_image_uploads_image_idx
    ON profile_image_uploads(image_key);
