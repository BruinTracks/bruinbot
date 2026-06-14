-- Terms table
CREATE TABLE terms (
  id SERIAL PRIMARY KEY,
  term_code VARCHAR(10) UNIQUE NOT NULL,
  term_name VARCHAR(50) NOT NULL
);

-- Subjects table
CREATE TABLE subjects (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL
);

-- Courses table
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  subject_id INT REFERENCES subjects(id),
  catalog_number VARCHAR(10) NOT NULL,
  title TEXT,
  short_title TEXT,
  UNIQUE(subject_id, catalog_number)
);

-- Sections table
CREATE TABLE sections (
  id SERIAL PRIMARY KEY,
  course_id INT REFERENCES courses(id),
  term_id INT REFERENCES terms(id),
  class_number VARCHAR(10) NOT NULL,
  section_code VARCHAR(10) NOT NULL,   -- e.g. "001", "001A"
  is_primary BOOLEAN NOT NULL,         -- True for primary section (e.g. lecture)
  activity VARCHAR(20),               -- e.g. "Lecture", "Discussion", "Laboratory"
  enrollment_cap INT,
  enrollment_total INT,
  waitlist_cap INT,
  waitlist_total INT,
  UNIQUE(term_id, course_id, section_code)
);

-- Meeting times table
CREATE TABLE meeting_times (
  id SERIAL PRIMARY KEY,
  section_id INT REFERENCES sections(id) ON DELETE CASCADE,
  days_of_week VARCHAR(10),   -- e.g. "MWF", "TR"
  start_time TIME,
  end_time TIME,
  building VARCHAR(20),
  room VARCHAR(20)
);

-- Instructors table
CREATE TABLE instructors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

-- Section-Instructors join table (many-to-many relationship)
CREATE TABLE section_instructors (
  section_id INT REFERENCES sections(id) ON DELETE CASCADE,
  instructor_id INT REFERENCES instructors(id),
  PRIMARY KEY (section_id, instructor_id)
);

-- Course requisites table
CREATE TABLE course_requisites (
  id SERIAL PRIMARY KEY,
  course_id INT REFERENCES courses(id) ON DELETE CASCADE,
  requisite_course_id INT REFERENCES courses(id),
  is_prerequisite BOOLEAN,   -- True if this requisite must be completed prior
  is_corequisite BOOLEAN,    -- True if this requisite may be taken concurrently
  min_grade VARCHAR(2)       -- Minimum grade required (if applicable)
);