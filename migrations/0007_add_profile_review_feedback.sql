-- Migration number: 0007 	 2026-08-18T00:00:00.000Z
-- Private feedback explains a rejection to the profile owner. It is cleared
-- whenever the owner edits and resubmits, and is never part of public reads.

ALTER TABLE profiles ADD COLUMN review_note TEXT;
