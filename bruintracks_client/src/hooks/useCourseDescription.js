import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const normalizePlaceholderLabel = (name) =>
  String(name || '')
    .replace(/^RESOLVE:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const parsePlaceholderLabel = (rawName) => {
  const normalized = normalizePlaceholderLabel(rawName);
  const slotMatch = normalized.match(/\s+#(\d+)\s*$/i);
  const slotNumber = slotMatch?.[1] || null;
  const requirementName = normalized.replace(/\s+#\d+\s*$/i, '').trim();
  return {
    normalized,
    slotNumber,
    requirementName
  };
};

const formatSlotSuffix = (slotNumber) =>
  slotNumber ? ` This is placeholder slot ${slotNumber}.` : '';

const buildElectiveDescription = (rawName) => {
  const { requirementName, slotNumber } = parsePlaceholderLabel(rawName);
  const withoutNumber = requirementName;
  const slotSuffix = formatSlotSuffix(slotNumber);

  if (/technical breadth/i.test(withoutNumber)) {
    return `Technical breadth requirement.${slotSuffix} Pick an upper-division engineering or STEM course outside your major area that counts toward technical breadth.`;
  }

  if (/(computer science|com\s*sci|\bcs\b)\s+elective/i.test(withoutNumber)) {
    return `Computer Science elective requirement.${slotSuffix} Choose an upper-division CS course that fits your track and prerequisite chain.`;
  }

  if (
    /(electrical and computer engineering|\bece\b)\s+elective/i.test(
      withoutNumber
    )
  ) {
    return `Electrical and Computer Engineering elective requirement.${slotSuffix} Choose an upper-division ECE course aligned with your specialization.`;
  }

  if (/science and technology/i.test(withoutNumber)) {
    return `Science and technology requirement.${slotSuffix} Choose an approved science or technology course that fits your major's requirement rules and your prerequisite progress.`;
  }

  if (/major field elective/i.test(withoutNumber)) {
    return `Major field elective requirement.${slotSuffix} Choose a course from the approved major field elective list for your program.`;
  }

  if (/field elective/i.test(withoutNumber)) {
    return `Field elective requirement.${slotSuffix} Choose a course from the approved field elective list for your program or track.`;
  }

  if (/upper-division/i.test(withoutNumber) && /elective/i.test(withoutNumber)) {
    return `${withoutNumber} requirement.${slotSuffix} Choose an approved upper-division course in this area that matches your prerequisite progress.`;
  }

  if (/elective/i.test(withoutNumber)) {
    return `${withoutNumber || 'Elective'} requirement.${slotSuffix} This is an unresolved major requirement placeholder. Choose a course that satisfies this specific requirement in your major worksheet.`;
  }

  return `${withoutNumber || 'Requirement'} placeholder.${slotSuffix} This slot still needs a specific course from your major requirements.`;
};

const isElectivePlaceholder = (name) => {
  const normalized = normalizePlaceholderLabel(name);
  return (
    /^RESOLVE:/i.test(String(name || '')) ||
    /elective/i.test(normalized) ||
    /technical breadth/i.test(normalized)
  );
};

const isGeCourse = (name) => {
  const value = String(name || '');
  return /\(\s*GE\s*-\s*[^)]+\)/i.test(value) || /^GE Course\s*\(/i.test(value);
};

const buildGeDescription = (name) => {
  const value = String(name || '');
  const geTagMatch = value.match(/\(\s*GE\s*-\s*([^)]+)\)/i);
  const geCourseMatch = value.match(/^GE Course\s*\(([^)]+)\)/i);
  const foundation =
    geTagMatch?.[1]?.trim() ||
    geCourseMatch?.[1]?.trim() ||
    'General Education';
  return `General Education course for ${foundation}. Ask Schedule Editor to help you pick a personalized GE for you based on your interests and GE requirements.`;
};

const isFillerCourse = (name) => {
  const value = String(name || '').trim();
  return value === 'FILLER' || /^FILLER_/i.test(value);
};

const buildFillerDescription = () =>
  'This is an open placeholder you can fill. Ask Schedule Editor to swap this filler with a course based on your interests that also meets your prerequisites.';

export const useCourseDescription = (courseName) => {
  const [description, setDescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDescription = async () => {
      setLoading(true);
      setError(null);

      if (!courseName) {
        setLoading(false);
        return;
      }

      if (isFillerCourse(courseName)) {
        setDescription(buildFillerDescription());
        setLoading(false);
        return;
      }

      if (isElectivePlaceholder(courseName)) {
        setDescription(buildElectiveDescription(courseName));
        setLoading(false);
        return;
      }

      if (isGeCourse(courseName)) {
        setDescription(buildGeDescription(courseName));
        setLoading(false);
        return;
      }

      try {
        // Split course name into subject code and catalog number
        const [subjectCode, catalogNumber] = courseName.split('|');

        // First get subject ID
        const { data: subjectData, error: subjectError } = await supabase
          .from('subjects')
          .select('id')
          .eq('code', subjectCode)
          .single();

        if (subjectError) throw subjectError;
        if (!subjectData) throw new Error('Subject not found');

        // Then get course ID using subject_id and catalog_number
        const { data: courseData, error: courseError } = await supabase
          .from('courses')
          .select('id')
          .eq('subject_id', subjectData.id)
          .eq('catalog_number', catalogNumber)
          .single();

        if (courseError) throw courseError;
        if (!courseData) throw new Error('Course not found');

        // Finally get description from course_descriptions using course_id
        const { data: descriptionData, error: descriptionError } =
          await supabase
            .from('course_descriptions')
            .select('description')
            .eq('course_id', courseData.id)
            .single();

        if (descriptionError) throw descriptionError;

        setDescription(
          descriptionData?.description || 'No description available'
        );
        setError(null);
      } catch (err) {
        setError(err.message);
        setDescription(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDescription();
  }, [courseName]);

  return { description, loading, error };
};
