CREATE OR REPLACE function get_courses_by_foundation(foundation_text text)
returns TABLE (
  subject_code text,
  course_code text,
  course_name text
)
language sql
as $$
  SELECT DISTINCT sub.code AS subject_code, ge.course_code, ge.course_name
  FROM general_education ge
  INNER JOIN subjects sub 
    ON sub.id = ge.subject_id
  WHERE ge.foundation = foundation_text
  LIMIT 10;
$$;