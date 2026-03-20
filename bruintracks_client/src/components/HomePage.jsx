/* eslint-disable react/prop-types */
import { useState, useEffect } from 'react';
import '../index.css';
import '../App.css';
import { motion } from 'framer-motion';
import { Chatbox } from './Chatbox';
import { handleSignOut } from '../supabaseClient.js';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import GoogleCalendarButton from './GoogleCalendarButton';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useCourseDescription } from '../hooks/useCourseDescription';
import { ScheduleEditChat } from './ScheduleEditChat';

export const CourseCard = ({ course, courseData, isFirstTerm }) => {
  const { description, loading } = useCourseDescription(course);

  // Clean course name by replacing "|" with a space
  const cleanCourseName = (name) => {
    return name.replace(/\|/g, ' ');
  };

  // For terms after the first one, show a simple card
  if (!isFirstTerm) {
    return (
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <motion.div
              className="bg-gray-700 rounded-lg shadow-md p-3 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5 }}
            >
              <h3 className="text-sm font-semibold text-white">
                {course === 'FILLER' ? 'Filler Course' : cleanCourseName(course)}
              </h3>
            </motion.div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-gray-800 text-white p-3 rounded-lg shadow-lg max-w-md text-sm"
              sideOffset={5}
            >
              {loading ? 'Loading...' : description}
              <Tooltip.Arrow className="fill-gray-800" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  // If it's a filler course, show a simple card without the "not available" message
  if (course === 'FILLER' || course.startsWith('FILLER_')) {
    return (
      <motion.div
        className="bg-gray-700 rounded-lg shadow-md p-4 mb-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -5 }}
      >
        <h3 className="text-lg font-semibold text-white">Filler Course</h3>
      </motion.div>
    );
  }

  // If courseData is not an object or is null, return a simple card
  if (!courseData || typeof courseData !== 'object') {
    return (
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <motion.div
              className="bg-gray-700 rounded-lg shadow-md p-4 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5 }}
            >
              <h3 className="text-lg font-semibold text-white">
                {cleanCourseName(course)}
              </h3>
              <p className="text-gray-400">Course details not available</p>
            </motion.div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-gray-800 text-white p-3 rounded-lg shadow-lg max-w-md text-sm"
              sideOffset={5}
            >
              {loading ? 'Loading...' : description}
              <Tooltip.Arrow className="fill-gray-800" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  // Handle both old and new data structures
  const lecture = courseData.lecture || courseData;
  const discussion = courseData.discussion;

  // Calculate enrollment percentage
  const getEnrollmentPercentage = (enrollment, cap) => {
    if (!enrollment || !cap) return 0;
    return Math.min((enrollment / cap) * 100, 100);
  };

  // Get color based on enrollment percentage
  const getEnrollmentColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <motion.div
            className="bg-gray-700 rounded-lg shadow-md p-4 mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5 }}
          >
            <h3 className="text-lg font-semibold text-white mb-2">{cleanCourseName(course)}</h3>

            {/* Lecture Section */}
            <div className="mb-3">
              <h4 className="text-md font-medium text-blue-400">Lecture</h4>
              <div className="ml-4">
                {lecture.section && (
                  <p className="text-sm text-gray-400">Section: {lecture.section}</p>
                )}
                {lecture.instructors && (
                  <p className="text-sm text-gray-400">
                    Instructor:{' '}
                    {Array.isArray(lecture.instructors)
                      ? lecture.instructors.join(', ')
                      : lecture.instructors}
                  </p>
                )}
                {lecture.times &&
                  lecture.times.map((time, idx) => (
                    <div key={idx} className="text-sm text-gray-400">
                      {time.days && <p>Days: {time.days}</p>}
                      {time.start && time.end && <p>Time: {time.start} - {time.end}</p>}
                      {time.building && time.room && (
                        <p>Location: {time.building} {time.room}</p>
                      )}
                    </div>
                  ))}
                {lecture.enrollment_total !== undefined && (
                  <div className="mt-2 space-y-2">
                    {/* Enrollment Bar */}
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>
                          Enrollment: {lecture.enrollment_total}/{lecture.enrollment_cap}
                        </span>
                        <span>
                          {Math.round(getEnrollmentPercentage(
                            lecture.enrollment_total,
                            lecture.enrollment_cap
                          ))}
                          %
                        </span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${getEnrollmentColor(
                            getEnrollmentPercentage(
                              lecture.enrollment_total,
                              lecture.enrollment_cap
                            )
                          )}`}
                          style={{
                            width: `${getEnrollmentPercentage(
                              lecture.enrollment_total,
                              lecture.enrollment_cap
                            )}%`
                          }}
                        />
                      </div>
                    </div>

                    {/* Waitlist Bar */}
                    {lecture.waitlist_total > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>
                            Waitlist: {lecture.waitlist_total}/{lecture.waitlist_cap}
                          </span>
                          <span>
                            {Math.round(getEnrollmentPercentage(
                              lecture.waitlist_total,
                              lecture.waitlist_cap
                            ))}
                            %
                          </span>
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-purple-500"
                            style={{
                              width: `${getEnrollmentPercentage(
                                lecture.waitlist_total,
                                lecture.waitlist_cap
                              )}%`
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Discussion Section */}
            {discussion && (
              <div>
                <h4 className="text-md font-medium text-blue-400">Discussion</h4>
                <div className="ml-4">
                  {discussion.section && (
                    <p className="text-sm text-gray-400">Section: {discussion.section}</p>
                  )}
                  {discussion.instructors && (
                    <p className="text-sm text-gray-400">
                      Instructor:{' '}
                      {Array.isArray(discussion.instructors)
                        ? discussion.instructors.join(', ')
                        : discussion.instructors}
                    </p>
                  )}
                  {discussion.times &&
                    discussion.times.map((time, idx) => (
                      <div key={idx} className="text-sm text-gray-400">
                        {time.days && <p>Days: {time.days}</p>}
                        {time.start && time.end && <p>Time: {time.start} - {time.end}</p>}
                        {time.building && time.room && (
                          <p>Location: {time.building} {time.room}</p>
                        )}
                      </div>
                    ))}
                  {discussion.enrollment_total !== undefined && (
                    <div className="mt-2 space-y-2">
                      {/* Enrollment Bar */}
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>
                            Enrollment: {discussion.enrollment_total}/{discussion.enrollment_cap}
                          </span>
                          <span>
                            {Math.round(getEnrollmentPercentage(
                              discussion.enrollment_total,
                              discussion.enrollment_cap
                            ))}
                            %
                          </span>
                        </div>
                        <div className="w-full bg-gray-600 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${getEnrollmentColor(
                              getEnrollmentPercentage(
                                discussion.enrollment_total,
                                discussion.enrollment_cap
                              )
                            )}`}
                            style={{
                              width: `${getEnrollmentPercentage(
                                discussion.enrollment_total,
                                discussion.enrollment_cap
                              )}%`
                            }}
                          />
                        </div>
                      </div>

                      {/* Waitlist Bar */}
                      {discussion.waitlist_total > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>
                              Waitlist: {discussion.waitlist_total}/{discussion.waitlist_cap}
                            </span>
                            <span>
                              {Math.round(getEnrollmentPercentage(
                                discussion.waitlist_total,
                                discussion.waitlist_cap
                              ))}
                              %
                            </span>
                          </div>
                          <div className="w-full bg-gray-600 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-purple-500"
                              style={{
                                width: `${getEnrollmentPercentage(
                                  discussion.waitlist_total,
                                  discussion.waitlist_cap
                                )}%`
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="bg-gray-800 text-white p-3 rounded-lg shadow-lg max-w-md text-sm"
            sideOffset={5}
          >
            {loading ? 'Loading...' : description}
            <Tooltip.Arrow className="fill-gray-800" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

export const QuarterSchedule = ({ quarter, courses, isFirstTerm }) => {

  // If courses is not an array or object, return null
  if (!courses || (typeof courses !== 'object' && !Array.isArray(courses))) {
    return null;
  }

  return (
    <motion.div
      className="mb-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-2xl font-bold text-white mb-4">{quarter}</h2>
      <div
        className={`grid ${
          isFirstTerm
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5'
        } gap-4`}
      >
        {Array.isArray(courses) ? (
          courses.map((course, idx) => (
            <CourseCard
              key={idx}
              course={course}
              courseData={null}
              isFirstTerm={isFirstTerm}
            />
          ))
        ) : (
          Object.entries(courses).map(([course, courseData]) => (
            <CourseCard
              key={course}
              course={course}
              courseData={courseData}
              isFirstTerm={isFirstTerm}
            />
          ))
        )}
      </div>
    </motion.div>
  );
};

export const ScheduleSummary = ({ scheduleData }) => {

  const totalCourses = Object.values(scheduleData).reduce((acc, quarter) => {
    if (Array.isArray(quarter)) {
      return acc + quarter.length;
    }
    return acc + Object.keys(quarter).length;
  }, 0);

  const quarters = Object.keys(scheduleData);
  const startQuarter = quarters[0];
  const endQuarter = quarters[quarters.length - 1];

  // Get preferences from localStorage
  const getPreferences = () => {
    try {
      const storedSchedule = localStorage.getItem('scheduleData');
      if (!storedSchedule) return null;

      const data = JSON.parse(storedSchedule);
      return data.preferences || null; // ← use data.preferences, not data.schedule.preferences
    } catch {
      return null;
    }
  };

  const preferences = getPreferences();

  return (
    <motion.div
      className="bg-gray-700 rounded-lg p-6 mb-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-2xl font-bold text-white mb-4">Schedule Summary</h2>

      {/* Basic Schedule Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div
          className="bg-gray-800 p-4 rounded-lg"
          whileHover={{ scale: 1.05 }}
        >
          <h3 className="text-lg font-semibold text-blue-400">Total Courses</h3>
          <p className="text-3xl font-bold text-white">{totalCourses}</p>
        </motion.div>
        <motion.div
          className="bg-gray-800 p-4 rounded-lg"
          whileHover={{ scale: 1.05 }}
        >
          <h3 className="text-lg font-semibold text-blue-400">Start Quarter</h3>
          <p className="text-xl text-white">{startQuarter}</p>
        </motion.div>
        <motion.div
          className="bg-gray-800 p-4 rounded-lg"
          whileHover={{ scale: 1.05 }}
        >
          <h3 className="text-lg font-semibold text-blue-400">End Quarter</h3>
          <p className="text-xl text-white">{endQuarter}</p>
        </motion.div>
      </div>

      {/* Preferences Summary */}
      {preferences && (
        <motion.div
          className="bg-gray-800 rounded-lg p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h3 className="text-lg font-semibold text-blue-400 mb-3">
            Your Preferences
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Course Load */}
            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">Course Load</p>
              <p className="text-white">
                {preferences.least_courses_per_term} -{' '}
                {preferences.max_courses_per_term} courses per quarter
              </p>
            </div>

            {/* Time Preferences */}
            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">Preferred Times</p>
              <p className="text-white">
                {preferences.pref_earliest && preferences.pref_latest
                  ? `${preferences.pref_earliest} - ${preferences.pref_latest}`
                  : 'No time preferences'}
              </p>
            </div>

            {/* Day Preferences */}
            <div className="bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-400">Preferred Days</p>
              <p className="text-white">
                {Array.isArray(preferences.pref_no_days) &&
                preferences.pref_no_days.length > 0
                  ? preferences.pref_no_days.join(', ')
                  : 'No day preferences'}
              </p>
            </div>

            {/* Professor Preferences */}
            {Array.isArray(preferences.pref_instructors) &&
              preferences.pref_instructors.length > 0 && (
                <div className="bg-gray-700 p-3 rounded">
                  <p className="text-sm text-gray-400">Preferred Professors</p>
                  <p className="text-white">
                    {preferences.pref_instructors.join(', ')}
                  </p>
                </div>
              )}

            {/* Course Preferences */}
            {Array.isArray(preferences.pref_buildings) &&
              preferences.pref_buildings.length > 0 && (
                <div className="bg-gray-700 p-3 rounded">
                  <p className="text-sm text-gray-400">Preferred Buildings</p>
                  <p className="text-white">
                    {preferences.pref_buildings.join(', ')}
                  </p>
                </div>
              )}

            {/* Other Preferences */}
            {preferences.tech_breadth && (
              <div className="bg-gray-700 p-3 rounded">
                <p className="text-sm text-gray-400">Tech Breadth</p>
                <p className="text-white">{preferences.tech_breadth}</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export const WeeklyCalendar = ({ courses }) => {
  /* ───────── constants ───────── */
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]; // display order
  const timeSlots = [
    "8:00 AM","8:30 AM","9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
    "12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","2:30 PM","3:00 PM","3:30 PM",
    "4:00 PM","4:30 PM","5:00 PM"
  ];

  const DAY_LABEL_WIDTH = 96;  // px (Tailwind w-24 ⇒ 6rem)
  const ROW_HEIGHT      = 40;  // px (min-h-[40px]) – each slot is 30 min

  /* ───────── helpers ───────── */
  const timeToMinutes = (t) => {
    if (!t) return 0;
    const [clock, period] = t.split(" ");
    let   [h, m]         = clock.split(":").map(Number);
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h  = 0;
    return h * 60 + m;
  };

  const dayMap = { M:"Monday", T:"Tuesday", W:"Wednesday", R:"Thursday", F:"Friday" };

  const occursOn = (timeObj, day) =>
    (timeObj?.days || "").split("").some((d) => dayMap[d] === day);

  // New function to detect overlapping courses
  const findOverlappingCourses = (day) => {
    const sessions = sessionsForDay(day);
    const overlaps = new Map(); // Map to store overlaps for each time slot

    sessions.forEach((session1, idx1) => {
      const start1 = timeToMinutes(session1.start);
      const end1 = timeToMinutes(session1.end);

      sessions.forEach((session2, idx2) => {
        if (idx1 === idx2) return; // Skip same session

        const start2 = timeToMinutes(session2.start);
        const end2 = timeToMinutes(session2.end);

        // Check if sessions overlap
        if (start1 < end2 && start2 < end1) {
          const key = `${session1.name}-${session1.label}`;
          if (!overlaps.has(key)) {
            overlaps.set(key, new Set());
          }
          overlaps.get(key).add(`${session2.name}-${session2.label}`);
        }
      });
    });

    return overlaps;
  };

  /**
   * Flatten -> array of { name, label, start, end, building, room } for that day
   */
  const sessionsForDay = (day) =>
    Object.entries(courses).flatMap(([name, data]) => {
      const lecture    = data.lecture    || data;
      const discussion = data.discussion || {};
      return [
        { label: "Lecture",    info: lecture.times?.[0]    },
        { label: "Discussion", info: discussion.times?.[0] }
      ]
        .filter(({ info }) => info && occursOn(info, day))
        .map(({ label, info }) => ({ name, label, ...info }));
    });

  /* ───────── render ───────── */
  return (
    <motion.div
      className="bg-gray-700 rounded-lg shadow-md p-6 mb-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="text-2xl font-bold text-white mb-6">Weekly Schedule</h2>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* header row */}
          <div
            className="grid gap-y-4 mb-4"
            style={{
              gridTemplateColumns: `${DAY_LABEL_WIDTH}px repeat(5, minmax(0, 1fr))`
            }}
          >
            {/* gutter column */}
            <div></div>
            {days.map((d) => (
              <div key={d} className="text-center">
                <h3 className="text-lg font-semibold text-blue-400">{d}</h3>
              </div>
            ))}
          </div>

          {/* time grid */}
          <div className="relative">
            {timeSlots.map((t) => (
              <div
                key={t}
                className="grid"
                style={{
                  minHeight: ROW_HEIGHT,
                  gridTemplateColumns: `${DAY_LABEL_WIDTH}px repeat(5, minmax(0, 1fr))`
                }}
              >
                {/* time label */}
                <div className="flex items-center justify-center border-b border-gray-600">
                  <span className="text-sm text-gray-400">{t}</span>
                </div>
                {/* five day cells */}
                {days.map((d) => (
                  <div key={`${d}-${t}`} className="border-b border-gray-600"></div>
                ))}
              </div>
            ))}

            {/* course blocks */}
            {days.flatMap((day, colIdx) => {
              const blocks = sessionsForDay(day);
              const overlaps = findOverlappingCourses(day);

              return blocks.map((blk) => {
                const startM = timeToMinutes(blk.start);
                const endM = timeToMinutes(blk.end);
                const top = ((startM - 480) / 30) * ROW_HEIGHT; // 480 = 8*60
                const height = Math.max(
                  ((endM - startM) / 30) * ROW_HEIGHT,
                  ROW_HEIGHT
                );
                const overlapCount =
                  overlaps.get(`${blk.name}-${blk.label}`)?.size || 0;

                return (
                  <motion.div
                    key={`${blk.name}-${blk.label}-${day}`}
                    className="absolute bg-gray-800 border border-blue-500 rounded p-2 text-white text-sm shadow-lg overflow-hidden"
                    style={{
                      top: top,
                      height: height - 4, // small interior padding
                      left: `calc(${DAY_LABEL_WIDTH}px + ${colIdx} * ((100% - ${DAY_LABEL_WIDTH}px)/5))`,
                      width: `calc((100% - ${DAY_LABEL_WIDTH}px)/5)`
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.05, backgroundColor: "#1a365d" }}
                  >
                    {overlapCount > 0 && (
                      <div className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {overlapCount}
                      </div>
                    )}
                    <p className="font-semibold text-blue-400 break-words">
                      {blk.name.replace(/\|/g, " ")}
                    </p>
                    <p className="text-xs text-gray-400">{blk.label}</p>
                    {blk.building && blk.room && (
                      <p className="text-xs text-gray-400 break-words">
                        {blk.building} {blk.room}
                      </p>
                    )}
                  </motion.div>
                );
              });
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const HomePage = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [leastCoursesPerTerm, setLeastCoursesPerTerm] = useState(3);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);

  const handleChatButtonClick = () => {
    setIsChatOpen(true);
  };

  const onScheduleUpdate = (newSchedule) => {
    setScheduleData(newSchedule);
  };

  const handleScheduleEditorClick = () => {
    setIsScheduleEditorOpen(true);
  };

  useEffect(() => {
    // Helper function to convert quarter string to sortable number
    const quarterToSortValue = (quarterStr) => {
      const [quarter, yearStr] = quarterStr.split(' ');
      const year = parseInt(yearStr);
      // Adjust year for Fall quarter since it comes before Winter/Spring of next year
      // e.g., Fall 2024 should come before Winter 2025
      if (quarter === 'Fall') {
        return year * 10;
      } else if (quarter === 'Winter') {
        return (year - 1) * 10 + 1;
      } else if (quarter === 'Spring') {
        return (year - 1) * 10 + 2;
      } else { // Summer
        return (year - 1) * 10 + 3;
      }
    };

    // Helper function to sort quarters
    const sortQuarters = (schedule) => {
      const sortedEntries = Object.entries(schedule).sort((a, b) => {
        return quarterToSortValue(a[0]) - quarterToSortValue(b[0]);
      });
      return Object.fromEntries(sortedEntries);
    };

    const loadScheduleData = async () => {
      
      // Check if we're generating a schedule
      const storedSchedule = localStorage.getItem('scheduleData');
      if (storedSchedule) {
        try {
          const data = JSON.parse(storedSchedule);
          if (data.isGenerating) {
            setIsGeneratingSchedule(true);
            setLoading(true);
            return;
          }
        } catch {
          setIsGeneratingSchedule(false);
        }
      }
      
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      try {
        // Fetch the most recent schedule for the current user
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          setLoading(false);
          return;
        }

        if (!data) {
          setLoading(false);
          return;
        }

        
        // Extract schedule data and note from the response
        const note = data.schedule?.note;
        const actualSchedule = data.schedule.schedule;

        if (!actualSchedule) {
          setLoading(false);
          return;
        }

        // Pull least_courses_per_term from data.preferences (not data.schedule.preferences)
        if (
          data.preferences &&
          typeof data.preferences.least_courses_per_term === 'number'
        ) {
          setLeastCoursesPerTerm(data.preferences.least_courses_per_term);
        }

        // Get the actual schedule object

        // Validate and clean the schedule data
        const cleanedSchedule = {};
        Object.entries(actualSchedule).forEach(([quarter, courses]) => {
          // Skip if courses is not an object or array
          if (
            !courses ||
            (typeof courses !== 'object' && !Array.isArray(courses))
          ) {
            return;
          }

          // If it's an array, filter out invalid entries and FILLER
          if (Array.isArray(courses)) {
            const validCourses = courses.filter(
              (course) =>
                course &&
                typeof course === 'string' &&
                course.trim() !== '' &&
                course !== 'FILLER'
            );

            // Add filler courses if needed
            while (validCourses.length < leastCoursesPerTerm) {
              validCourses.push('FILLER');
            }

            cleanedSchedule[quarter] = validCourses;
          } else {
            // If it's an object, keep only valid course data
            cleanedSchedule[quarter] = {};
            Object.entries(courses).forEach(([courseId, courseData]) => {
              if (courseData && typeof courseData === 'object') {
                cleanedSchedule[quarter][courseId] = courseData;
              }
            });

            // Add filler courses if needed
            while (
              Object.keys(cleanedSchedule[quarter]).length < leastCoursesPerTerm
            ) {
              const fillerId = `FILLER_${
                Object.keys(cleanedSchedule[quarter]).length + 1
              }`;
              cleanedSchedule[quarter][fillerId] = 'FILLER';
            }
          }
        });

        // Sort the quarters
        const sortedSchedule = sortQuarters(cleanedSchedule);
        setScheduleData(sortedSchedule);

        if (note) {
          // intentionally not rendered in UI
        }
      } catch {
        setScheduleData(null);
      } finally {
        setLoading(false);
        setIsGeneratingSchedule(false);
      }
    };

    loadScheduleData();
  }, [session, leastCoursesPerTerm]);

  const onSignOut = () => {
    handleSignOut();
    navigate("/");
  };

  if (loading || !scheduleData) {
    return (
      <div className="bg-gray-900 min-h-screen min-w-screen text-white flex flex-col items-center justify-center">
        <div className="text-center">
          {isGeneratingSchedule ? (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-gray-300">
                Generating your schedule...
              </h2>
              <p className="text-gray-400 mt-2">
                This may take a few minutes as we optimize your course schedule
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold text-gray-300 mb-6">
                Welcome to bruinbot
              </h2>
              <p className="text-gray-400 mb-8">
                Generate your personalized course schedule to help plan your academic journey
              </p>
              <motion.button
                onClick={() => navigate('/form')}
                className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Generate Schedule
              </motion.button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 min-h-screen min-w-screen text-white flex flex-col items-center pt-10">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <motion.h1
            className="text-3xl font-bold"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Your Schedule
          </motion.h1>
          <div className="flex gap-4">
            <GoogleCalendarButton scheduleData={scheduleData} />
            <motion.button
              onClick={() => navigate('/form')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Take me back to the form
            </motion.button>
            <motion.button
              onClick={() => navigate('/saved-schedules')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              View Saved Schedules
            </motion.button>
            <motion.button
              onClick={onSignOut}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Sign Out
            </motion.button>
          </div>
        </div>

        {/* Schedule Summary */}
        <ScheduleSummary scheduleData={scheduleData} />

    {/* Weekly Calendar (for first term only) */}

        {scheduleData && Object.entries(scheduleData)[0] && (
          <WeeklyCalendar 
            courses={Object.entries(scheduleData)[0][1]} 
            key={Object.entries(scheduleData)[0][0]} // Add key to force re-render when quarter changes
          />
        )}

        {/* Quarter Schedules */}
        {scheduleData && Object.entries(scheduleData)
          .filter(([, courses]) => {
            if (Array.isArray(courses)) {
              return courses.length > 0;
            }
            return Object.keys(courses).length > 0;
          })
          .map(([quarter, courses], index) => (
            <QuarterSchedule
              key={quarter}
              quarter={quarter}
              courses={courses}
              isFirstTerm={index === 0}
            />
          ))}

        {/* Floating Chat Buttons */}
        <div className="fixed bottom-6 right-5 flex justify-between w-full px-6">
          {/* Edit Button (Left Side) */}
          <button
            onClick={handleScheduleEditorClick}
            className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors duration-200 z-50"
            aria-label="Open schedule editor"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>

          {/* Chat Button (Right Side) */}
          <button
            onClick={handleChatButtonClick}
            className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-colors duration-200 z-50"
            aria-label="Open chat"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </button>
        </div>

        {/* Chat Interface */}
        {isChatOpen && (
          <motion.div
            className="fixed bottom-28 right-8 w-[400px] h-[600px] bg-gray-800 rounded-lg shadow-2xl z-50 border border-gray-700"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
          >
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <h3 className="text-lg font-semibold text-white">
                  AI Planning Assistant
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-colors"
                  title="Close"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="h-[calc(100%-4rem)] overflow-hidden">
              <Chatbox scheduleData={scheduleData} />
            </div>
          </motion.div>
        )}

        {/* Schedule Editor Interface */}
        {isScheduleEditorOpen && (
          <motion.div
            className="fixed bottom-28 left-8 w-[400px] h-[600px] bg-gray-800 rounded-lg shadow-2xl z-50 border border-gray-700"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
          >
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <h3 className="text-lg font-semibold text-white">
                  Schedule Editor
                </h3>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsScheduleEditorOpen(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-gray-700 transition-colors"
                  title="Close"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="h-[calc(100%-4rem)] overflow-hidden">
              <ScheduleEditChat scheduleData={scheduleData} onScheduleUpdate={onScheduleUpdate} />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};