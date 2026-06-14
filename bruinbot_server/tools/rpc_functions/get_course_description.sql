CREATE OR REPLACE FUNCTION get_course_description(subject_code TEXT, catalog_number TEXT)
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT cd.description
  FROM course_descriptions cd
  JOIN courses c ON c.id = cd.course_id
  JOIN subjects s ON s.id = c.subject_id
  WHERE s.code = subject_code AND c.catalog_number = catalog_number
  LIMIT 1;
$$;