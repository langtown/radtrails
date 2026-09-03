-- 0022 added descriptions for the radfriends and private personas, but no
-- migration ever inserted their rows into the personas catalog table (only
-- member/theteam/coach/alumni/admin were seeded in 0004). Granting either
-- persona violates user_personas' FOREIGN KEY REFERENCES personas(key) and
-- 500s. Insert the missing rows now.

INSERT INTO personas (key, label, is_public, sort_order, description) VALUES
    ('radfriends', 'RadFriends', 1, 5,
     'Friends of the project with lightweight public presence (rad friends).'),
    ('private',    'Private',    0, 6,
     'Private accounts used for internal or non-public purposes.');
