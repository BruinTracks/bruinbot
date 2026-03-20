import { useState } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

// Map UCLA quarter names to approximate start/end dates
const quarterDateRanges = {
  Winter: { start: '01-01', end: '03-31' },
  Spring: { start: '04-01', end: '06-14' },
  Summer: { start: '06-15', end: '09-30' },
  Fall:   { start: '10-01', end: '12-31' },
};

// Helper to get the first occurrence of a UCLA day character after quarter start
function getFirstDateForDay(year, quarterStart, dayChar) {
  const dayMap = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
  const [month, day] = quarterStart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const target = dayMap[dayChar];
  const diff = (target + 7 - date.getDay()) % 7;
  date.setDate(date.getDate() + diff);
  return date;
}

const GoogleCalendarButton = ({ scheduleData }) => {
  const [isLoading, setIsLoading] = useState(false);

  const addToGoogleCalendar = () => {
    setIsLoading(true);
    try {
      // Determine quarter range
      const [quarterLabel, courses] = Object.entries(scheduleData)[0];
      const [termName, termYear] = quarterLabel.split(' ');
      const year = parseInt(termYear, 10);
      const { start: qs, end: qe } = quarterDateRanges[termName];

      // Build a flat list of event objects
      const events = [];
      Object.entries(courses).forEach(([courseKey, courseData]) => {
        if (!courseData || typeof courseData !== 'object' || courseKey.startsWith('FILLER')) return;
        ['lecture', 'discussion'].forEach(type => {
          const section = courseData[type];
          if (!section || !section.times) return;
          section.times.forEach(t => {
            (t.days || '').split('').forEach(dayChar => {
              if (!/[MTWRFS]/.test(dayChar)) return;
              const firstDate = getFirstDateForDay(year, qs, dayChar);
              const dateStr = firstDate.toISOString().slice(0, 10);
              const start = `${dateStr}T${t.start}:00`;
              const end   = `${dateStr}T${t.end}:00`;
              const summary = `${courseKey.replace(/\|/g,' ')} (${type.charAt(0).toUpperCase()+type.slice(1)})`;
              const description = `Section: ${section.section}\nInstructors: ${section.instructors?.join(', ') || 'TBA'}`;
              const location = t.building || 'TBA';
              events.push({ summary, start, end, description, location });
            });
          });
        });
      });

      if (!events.length) throw new Error('No valid course times found');

      // Setup recurrence until quarter end
      const until = `${year}${qe.replace(/-/g,'')}T235959Z`;
      const recurrenceRule = `RRULE:FREQ=WEEKLY;UNTIL=${until}`;

      // For each event, open its own recurring calendar URL
      events.forEach(evt => {
        // Format dates without separators YYYYMMDDTHHMMSSZ
        const formatForUrl = dt => {
          const iso = new Date(dt).toISOString();
          return iso.replace(/[-:]/g, '').split('.')[0] + 'Z';
        };
        const startStr = formatForUrl(evt.start);
        const endStr   = formatForUrl(evt.end);
        const details  = encodeURIComponent(evt.description);
        const url =
          `https://calendar.google.com/calendar/render?action=TEMPLATE` +
          `&text=${encodeURIComponent(evt.summary)}` +
          `&dates=${startStr}/${endStr}` +
          `&recur=${encodeURIComponent(recurrenceRule)}` +
          `&details=${details}` +
          `&location=${encodeURIComponent(evt.location)}`;
        window.open(url, '_blank');
      });

    } catch (err) {
      alert(err.message || 'Failed to create event links');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.button
      onClick={addToGoogleCalendar}
      disabled={isLoading}
      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {isLoading ? 'Generating Events...' : 'Add to Google Calendar'}
    </motion.button>
  );
};

GoogleCalendarButton.propTypes = {
  scheduleData: PropTypes.object.isRequired,
};

export default GoogleCalendarButton;