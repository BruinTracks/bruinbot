CREATE OR REPLACE FUNCTION get_courses_by_subject(subject_code TEXT)
RETURNS TABLE (
  course_code TEXT,
  title TEXT
)
LANGUAGE SQL
AS $$
  SELECT c.catalog_number AS course_code, c.title
  FROM courses c
  JOIN subjects s ON c.subject_id = s.id
  WHERE s.code = subject_code
  LIMIT 10;
$$;