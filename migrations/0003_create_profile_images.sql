-- Migration number: 0003 	 2026-08-14T00:00:00.000Z
-- Uploaded profile images, stored in D1 rather than R2 (radtrails-osq.12).
--
-- R2 would be the natural home for blobs, but enabling R2 requires a payment
-- method on the Cloudflare account even within its free allowance, and this
-- project is deliberately $0 with no card on file. At this scale the trade is
-- comfortable: a few dozen rider photos, well inside D1's 500MB per-database
-- limit, and each image is read through an immutable edge cache so D1 is hit
-- rarely.
--
-- The cost of this choice is a hard ceiling: D1 caps a single value at 2MB, so
-- uploads must be validated and rejected above roughly 1MB.
--
-- Images live in their own table so that querying profiles never drags blob
-- data along. `image_key` is a content hash, which makes image URLs immutable
-- and safely cacheable forever.

CREATE TABLE profile_images (
    image_key TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    bytes BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
