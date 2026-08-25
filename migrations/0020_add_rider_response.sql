-- A rider's RSVP on a still-scheduled occurrence: NULL means confirmed
-- (attending, the default), 'unsure' flags it for the coach without
-- changing status or freeing the slot.
ALTER TABLE session_occurrences
    ADD COLUMN rider_response TEXT CHECK (rider_response IS NULL OR rider_response = 'unsure');
