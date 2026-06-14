CREATE OR REPLACE FUNCTION get_instructors_by_term(term_name TEXT)
RETURNS TABLE (
  instructor_name TEXT,
  course_title TEXT,
  section_code TEXT
)
LANGUAGE SQL
AS $$
  SELECT i.name AS instructor_name, c.title AS course_title, s.section_code
  FROM instructors i
  JOIN section_instructors si ON si.instructor_id = i.id
  JOIN sections s ON s.id = si.section_id
  JOIN terms t ON t.id = s.term_id
  JOIN courses c ON c.id = s.course_id
  WHERE t.term_name = term_name;
$$;