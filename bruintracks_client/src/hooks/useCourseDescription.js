import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const useCourseDescription = (courseName) => {
  const [description, setDescription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDescription = async () => {
      if (!courseName || courseName === 'FILLER') {
        setLoading(false);
        return;
      }

      // If it's an elective, return a generic description
      if (courseName.includes('Elective')) {
        const subject = courseName.replace('Elective', '').trim();
        setDescription(`An upper-division elective course in ${subject}.`);
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
        const { data: descriptionData, error: descriptionError } = await supabase
          .from('course_descriptions')
          .select('description')
          .eq('course_id', courseData.id)
          .single();

        if (descriptionError) throw descriptionError;
        
        setDescription(descriptionData?.description || 'No description available');
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