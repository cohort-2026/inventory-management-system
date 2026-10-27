
-- D. Foreign keys that depend on public.users
-- or auth.users

SELECT
    con.conrelid::regclass AS source_table,
    con.conname AS constraint_name,
    con.confrelid::regclass AS referenced_table,
    pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.confrelid IN (
      'public.users'::regclass,
      'auth.users'::regclass
  )
ORDER BY
    con.conrelid::regclass::text,
    con.conname;
