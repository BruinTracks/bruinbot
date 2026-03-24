/* eslint-disable react/prop-types */
import { useState, useEffect, useRef } from 'react';
import '../index.css';
import '../App.css';
import { motion, useDragControls } from 'framer-motion';
import { Chatbox } from './Chatbox';
import { handleSignOut } from '../supabaseClient.js';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import GoogleCalendarButton from './GoogleCalendarButton';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useCourseDescription } from '../hooks/useCourseDescription';
import { ScheduleEditChat } from './ScheduleEditChat';

const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const PANEL_CLASS =
  'rounded-3xl border border-slate-700/80 bg-slate-900/80 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-sm';
const SUBPANEL_CLASS =
  'rounded-2xl border border-slate-700/70 bg-slate-800/85 shadow-lg';
const ACTION_BUTTON_CLASS =
  'inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 whitespace-nowrap';

export const CourseCard = ({ course, courseData, isFirstTerm }) => {
  const { description, loading } = useCourseDescription(course);

  // Clean course name by replacing "|" with a space
  const cleanCourseName = (name) => {
    return String(name)
      .replace(/^RESOLVE:\s*/i, '')
      .replace(/\|/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // For terms after the first one, show a simple card
  if (!isFirstTerm) {
    return (
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <motion.div
              className={`${SUBPANEL_CLASS} mb-4 p-3`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5, borderColor: 'rgba(96,165,250,0.45)' }}
            >
              <h3 className="text-sm font-semibold text-white">
                {course === 'FILLER' ? 'Filler Course' : cleanCourseName(course)}
              </h3>
            </motion.div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="max-w-md rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white shadow-2xl"
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
        className={`${SUBPANEL_CLASS} mb-4 p-4`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -5, borderColor: 'rgba(96,165,250,0.45)' }}
      >
        <h3 className="text-lg font-semibold text-white">Filler Course</h3>
        <p className="mt-2 text-sm text-slate-300">
          Open slot available for a personalized course recommendation.
        </p>
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
              className={`${SUBPANEL_CLASS} mb-4 p-4`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5, borderColor: 'rgba(96,165,250,0.45)' }}
            >
              <h3 className="text-lg font-semibold text-white">
                {cleanCourseName(course)}
              </h3>
              <p className="text-slate-300">Course details not available</p>
            </motion.div>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="max-w-md rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white shadow-2xl"
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
            className={`${SUBPANEL_CLASS} mb-4 p-4`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5, borderColor: 'rgba(96,165,250,0.45)' }}
          >
            <h3 className="text-lg font-semibold text-white mb-2">{cleanCourseName(course)}</h3>

            {/* Lecture Section */}
            <div className="mb-3">
              <h4 className="text-md font-medium text-cyan-300">Lecture</h4>
              <div className="ml-4">
                {lecture.section && (
                  <p className="text-sm text-slate-300">Section: {lecture.section}</p>
                )}
                {lecture.instructors && (
                  <p className="text-sm text-slate-300">
                    Instructor:{' '}
                    {Array.isArray(lecture.instructors)
                      ? lecture.instructors.join(', ')
                      : lecture.instructors}
                  </p>
                )}
                {lecture.times &&
                  lecture.times.map((time, idx) => (
                    <div key={idx} className="text-sm text-slate-300">
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
                      <div className="mb-1 flex justify-between text-xs text-slate-300">
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
                      <div className="h-2 w-full rounded-full bg-slate-700">
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
                        <div className="mb-1 flex justify-between text-xs text-slate-300">
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
                        <div className="h-2 w-full rounded-full bg-slate-700">
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
                <h4 className="text-md font-medium text-cyan-300">Discussion</h4>
                <div className="ml-4">
                  {discussion.section && (
                    <p className="text-sm text-slate-300">Section: {discussion.section}</p>
                  )}
                  {discussion.instructors && (
                    <p className="text-sm text-slate-300">
                      Instructor:{' '}
                      {Array.isArray(discussion.instructors)
                        ? discussion.instructors.join(', ')
                        : discussion.instructors}
                    </p>
                  )}
                  {discussion.times &&
                    discussion.times.map((time, idx) => (
                      <div key={idx} className="text-sm text-slate-300">
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
                        <div className="mb-1 flex justify-between text-xs text-slate-300">
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
                        <div className="h-2 w-full rounded-full bg-slate-700">
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
                          <div className="mb-1 flex justify-between text-xs text-slate-300">
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
                          <div className="h-2 w-full rounded-full bg-slate-700">
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
            className="max-w-md rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-white shadow-2xl"
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
      className={`${PANEL_CLASS} mb-8 p-6`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
            Quarter Plan
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">{quarter}</h2>
        </div>
        <div className="rounded-full border border-slate-600 bg-slate-800/90 px-3 py-1 text-xs text-slate-200">
          {Array.isArray(courses) ? courses.length : Object.keys(courses).length} courses
        </div>
      </div>
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
      className={`${PANEL_CLASS} mb-8 p-6`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
          Overview
        </p>
        <h2 className="mt-1 text-2xl font-bold text-white">Schedule Summary</h2>
        <p className="mt-2 text-sm text-slate-300">
          A quick snapshot of your plan, timeline, and saved preferences.
        </p>
      </div>

      {/* Basic Schedule Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <motion.div
          className={`${SUBPANEL_CLASS} p-4`}
          whileHover={{ scale: 1.03, borderColor: 'rgba(34,211,238,0.35)' }}
        >
          <h3 className="text-lg font-semibold text-cyan-300">Total Courses</h3>
          <p className="text-3xl font-bold text-white">{totalCourses}</p>
        </motion.div>
        <motion.div
          className={`${SUBPANEL_CLASS} p-4`}
          whileHover={{ scale: 1.03, borderColor: 'rgba(34,211,238,0.35)' }}
        >
          <h3 className="text-lg font-semibold text-cyan-300">Start Quarter</h3>
          <p className="text-xl text-white">{startQuarter}</p>
        </motion.div>
        <motion.div
          className={`${SUBPANEL_CLASS} p-4`}
          whileHover={{ scale: 1.03, borderColor: 'rgba(34,211,238,0.35)' }}
        >
          <h3 className="text-lg font-semibold text-cyan-300">End Quarter</h3>
          <p className="text-xl text-white">{endQuarter}</p>
        </motion.div>
      </div>

      {/* Preferences Summary */}
      {preferences && (
        <motion.div
          className={`${SUBPANEL_CLASS} p-4`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h3 className="mb-3 text-lg font-semibold text-cyan-300">
            Your Preferences
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Course Load */}
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-sm text-slate-400">Course Load</p>
              <p className="text-white">
                {preferences.least_courses_per_term} -{' '}
                {preferences.max_courses_per_term} courses per quarter
              </p>
            </div>

            {/* Time Preferences */}
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-sm text-slate-400">Preferred Times</p>
              <p className="text-white">
                {preferences.pref_earliest && preferences.pref_latest
                  ? `${preferences.pref_earliest} - ${preferences.pref_latest}`
                  : 'No time preferences'}
              </p>
            </div>

            {/* Unpreferred Day Preferences */}
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
              <p className="text-sm text-slate-400">Unpreferred Days</p>
              <p className="text-white">
                {Array.isArray(preferences.pref_no_days) &&
                preferences.pref_no_days.length > 0
                  ? preferences.pref_no_days.join(', ')
                  : 'No unpreferred days'}
              </p>
            </div>

            {/* Professor Preferences */}
            {Array.isArray(preferences.pref_instructors) &&
              preferences.pref_instructors.length > 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                  <p className="text-sm text-slate-400">Preferred Professors</p>
                  <p className="text-white">
                    {preferences.pref_instructors.join(', ')}
                  </p>
                </div>
              )}

            {/* Course Preferences */}
            {Array.isArray(preferences.pref_buildings) &&
              preferences.pref_buildings.length > 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                  <p className="text-sm text-slate-400">Preferred Buildings</p>
                  <p className="text-white">
                    {preferences.pref_buildings.join(', ')}
                  </p>
                </div>
              )}

            {/* Other Preferences */}
            {preferences.tech_breadth && (
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3">
                <p className="text-sm text-slate-400">Tech Breadth</p>
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
      className={`${PANEL_CLASS} mb-8 p-6`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
          First Quarter
        </p>
        <h2 className="mt-1 text-2xl font-bold text-white">Weekly Schedule</h2>
        <p className="mt-2 text-sm text-slate-300">
          A time-based view of your earliest scheduled quarter.
        </p>
      </div>

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
                <h3 className="text-lg font-semibold text-cyan-300">{d}</h3>
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
                <div className="flex items-center justify-center border-b border-slate-700">
                  <span className="text-sm text-slate-400">{t}</span>
                </div>
                {/* five day cells */}
                {days.map((d) => (
                  <div key={`${d}-${t}`} className="border-b border-slate-700"></div>
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
                    className="absolute overflow-hidden rounded-xl border border-cyan-400/45 bg-slate-800/95 p-2 text-sm text-white shadow-lg"
                    style={{
                      top: top,
                      height: height - 4, // small interior padding
                      left: `calc(${DAY_LABEL_WIDTH}px + ${colIdx} * ((100% - ${DAY_LABEL_WIDTH}px)/5))`,
                      width: `calc((100% - ${DAY_LABEL_WIDTH}px)/5)`
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.03, backgroundColor: '#18314f' }}
                  >
                    {overlapCount > 0 && (
                      <div className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {overlapCount}
                      </div>
                    )}
                    <p className="break-words font-semibold text-cyan-300">
                      {blk.name.replace(/\|/g, " ")}
                    </p>
                    <p className="text-xs text-slate-300">{blk.label}</p>
                    {blk.building && blk.room && (
                      <p className="break-words text-xs text-slate-300">
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
  const location = useLocation();
  const { session } = useAuth();
  const pageRef = useRef(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);
  const [leastCoursesPerTerm, setLeastCoursesPerTerm] = useState(3);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isScheduleEditorOpen, setIsScheduleEditorOpen] = useState(false);
  const planningDragControls = useDragControls();
  const editorDragControls = useDragControls();

  const handleChatButtonClick = () => {
    setIsChatOpen(true);
  };

  const onScheduleUpdate = (newSchedule) => {
    setScheduleData(newSchedule);
  };

  const handleScheduleEditorClick = () => {
    setIsScheduleEditorOpen(true);
  };

  const getStoredGenerationState = () => {
    try {
      const storedSchedule = localStorage.getItem('scheduleData');
      if (!storedSchedule) {
        return false;
      }

      const parsed = JSON.parse(storedSchedule);
      const startedAt = Number(parsed.startedAt || 0);
      const hasRecentAttempt =
        startedAt > 0 && Date.now() - startedAt <= GENERATION_TIMEOUT_MS;

      if (startedAt && !hasRecentAttempt) {
        return false;
      }

      if (parsed?.isGenerating) {
        return true;
      }

      // If the user is on the schedule page and a generation attempt was
      // started recently but the result has not been written yet, keep showing
      // the loading state instead of falling back to the welcome screen.
      if (
        location.pathname === '/schedule' &&
        hasRecentAttempt &&
        !parsed?.schedule?.schedule
      ) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  };

  const clearGeneratingState = () => {
    try {
      const storedSchedule = localStorage.getItem('scheduleData');
      if (storedSchedule) {
        const parsed = JSON.parse(storedSchedule);
        localStorage.setItem(
          'scheduleData',
          JSON.stringify({ ...parsed, isGenerating: false, startedAt: null })
        );
      } else {
        localStorage.setItem(
          'scheduleData',
          JSON.stringify({ isGenerating: false, startedAt: null })
        );
      }
    } catch {
      localStorage.setItem(
        'scheduleData',
        JSON.stringify({ isGenerating: false, startedAt: null })
      );
    }
    setIsGeneratingSchedule(false);
    setLoading(false);
    navigate('/form');
  };

  useEffect(() => {
    const quarterToSortValue = (quarterStr) => {
      const [quarter, yearStr] = quarterStr.split(' ');
      const year = parseInt(yearStr);
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

    const cleanSchedule = (schedule, minCoursesPerTerm) => {
      const cleanedSchedule = {};

      Object.entries(schedule).forEach(([quarter, courses]) => {
        if (!courses || (typeof courses !== 'object' && !Array.isArray(courses))) {
          return;
        }

        if (Array.isArray(courses)) {
          const validCourses = courses.filter(
            (course) =>
              course &&
              typeof course === 'string' &&
              course.trim() !== '' &&
              course !== 'FILLER'
          );

          while (validCourses.length < minCoursesPerTerm) {
            validCourses.push('FILLER');
          }

          cleanedSchedule[quarter] = validCourses;
          return;
        }

        cleanedSchedule[quarter] = {};
        Object.entries(courses).forEach(([courseId, courseData]) => {
          if (courseData && typeof courseData === 'object') {
            cleanedSchedule[quarter][courseId] = courseData;
          }
        });

        while (Object.keys(cleanedSchedule[quarter]).length < minCoursesPerTerm) {
          const fillerId = `FILLER_${Object.keys(cleanedSchedule[quarter]).length + 1}`;
          cleanedSchedule[quarter][fillerId] = 'FILLER';
        }
      });

      return sortQuarters(cleanedSchedule);
    };

    const loadScheduleFromStorage = () => {
      const storedSchedule = localStorage.getItem('scheduleData');
      if (!storedSchedule) {
        return { found: false, isGenerating: false, startedAt: 0 };
      }

      try {
        const data = JSON.parse(storedSchedule);
        const preferenceMinimum = data?.preferences?.least_courses_per_term;
        const minimumCourses =
          typeof preferenceMinimum === 'number'
            ? preferenceMinimum
            : leastCoursesPerTerm;

        if (typeof preferenceMinimum === 'number' && preferenceMinimum !== leastCoursesPerTerm) {
          setLeastCoursesPerTerm(preferenceMinimum);
        }

        if (data.isGenerating) {
          const startedAt = Number(data.startedAt || 0);
          if (startedAt && Date.now() - startedAt > GENERATION_TIMEOUT_MS) {
            localStorage.setItem(
              'scheduleData',
              JSON.stringify({ ...data, isGenerating: false })
            );
            return { found: false, isGenerating: false, startedAt: 0 };
          }

          return { found: false, isGenerating: true, startedAt };
        }

        const localSchedule = data?.schedule?.schedule;
        if (localSchedule && typeof localSchedule === 'object') {
          const cleanedLocalSchedule = cleanSchedule(localSchedule, minimumCourses);
          setScheduleData(cleanedLocalSchedule);
          setIsGeneratingSchedule(false);
          setLoading(false);
          return { found: true, isGenerating: false, startedAt: 0 };
        }
      } catch {
        setIsGeneratingSchedule(false);
      }

      return { found: false, isGenerating: false, startedAt: 0 };
    };

    const loadLatestScheduleFromDatabase = async (generationStartedAt = 0) => {
      if (!session?.user?.id) {
        return false;
      }

      try {
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error || !data?.schedule?.schedule) {
          return false;
        }

        const createdAtMs = data.created_at ? new Date(data.created_at).getTime() : 0;
        if (generationStartedAt && createdAtMs && createdAtMs + 1000 < generationStartedAt) {
          return false;
        }

        if (
          data.preferences &&
          typeof data.preferences.least_courses_per_term === 'number'
        ) {
          setLeastCoursesPerTerm(data.preferences.least_courses_per_term);
        }

        const minimumCourses =
          typeof data.preferences?.least_courses_per_term === 'number'
            ? data.preferences.least_courses_per_term
            : leastCoursesPerTerm;
        const cleanedSchedule = cleanSchedule(data.schedule.schedule, minimumCourses);

        setScheduleData(cleanedSchedule);
        setIsGeneratingSchedule(false);
        setLoading(false);

        try {
          const existing = JSON.parse(localStorage.getItem('scheduleData') || '{}');
          localStorage.setItem(
            'scheduleData',
            JSON.stringify({
              ...existing,
              ...data,
              isGenerating: false
            })
          );
        } catch {
          // If storage sync fails, keep the in-memory state update.
        }

        return true;
      } catch {
        return false;
      }
    };

    const loadScheduleData = async () => {
      const localResult = loadScheduleFromStorage();
      if (localResult.found) {
        return;
      }

      if (localResult.isGenerating) {
        setIsGeneratingSchedule(true);
        setLoading(true);

        const foundInDatabase = await loadLatestScheduleFromDatabase(localResult.startedAt);
        if (foundInDatabase) {
          return;
        }

        return;
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

        const minimumCourses =
          typeof data.preferences?.least_courses_per_term === 'number'
            ? data.preferences.least_courses_per_term
            : leastCoursesPerTerm;
        const sortedSchedule = cleanSchedule(actualSchedule, minimumCourses);
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

    const pollForGeneratedSchedule = window.setInterval(async () => {
      const localResult = loadScheduleFromStorage();
      if (localResult.found) {
        window.clearInterval(pollForGeneratedSchedule);
        return;
      }

      if (localResult.isGenerating) {
        setIsGeneratingSchedule(true);
        setLoading(true);
        const foundInDatabase = await loadLatestScheduleFromDatabase(localResult.startedAt);
        if (foundInDatabase) {
          window.clearInterval(pollForGeneratedSchedule);
        }
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadScheduleFromStorage();
      }
    };

    window.addEventListener('storage', loadScheduleFromStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(pollForGeneratedSchedule);
      window.removeEventListener('storage', loadScheduleFromStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session, leastCoursesPerTerm]);

  const onSignOut = () => {
    handleSignOut();
    navigate("/");
  };

  const hasStoredGeneratingState = getStoredGenerationState();

  if (loading || !scheduleData) {
    return (
      <div className="relative flex min-h-screen min-w-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.12),_transparent_30%)]" />
        <div className={`${PANEL_CLASS} relative mx-4 max-w-xl p-10 text-center`}>
          {isGeneratingSchedule || hasStoredGeneratingState ? (
            <>
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-slate-200">
                Bruin up your schedule...
              </h2>
              <p className="mt-2 text-slate-300">
                This may take a few minutes as we optimize your course schedule
              </p>
              <motion.button
                onClick={clearGeneratingState}
                className="mt-6 rounded-xl border border-slate-600 bg-slate-800 px-6 py-2 text-white transition-colors hover:bg-slate-700"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Stop and go back to form
              </motion.button>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                BruinBot Home
              </p>
              <h2 className="mb-3 mt-2 text-3xl font-semibold text-white">
                Welcome to bruinbot
              </h2>
              <p className="mb-8 text-slate-300">
                Generate your personalized course schedule to help plan your academic journey
              </p>
              <motion.button
                onClick={() => navigate('/form')}
                className="rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-blue-700"
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
    <div ref={pageRef} className="relative min-h-screen min-w-screen overflow-y-auto bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_28%),radial-gradient(circle_at_85%_15%,_rgba(59,130,246,0.10),_transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.22),rgba(2,6,23,0.48))]" />
      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-10">
        <div className={`${PANEL_CLASS} mb-8 overflow-hidden p-6`}>
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="max-w-3xl">
              <motion.p
                className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
              >
                BruinBot Home
              </motion.p>
              <motion.h1
            className="mt-2 text-4xl font-bold tracking-tight"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Your Schedule
          </motion.h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Review your academic plan, inspect your first-quarter calendar,
                and use the assistants to refine your roadmap in one place.
              </p>
            </div>
            <div className={`${SUBPANEL_CLASS} flex flex-col justify-between p-5`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Quick Actions
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">
                  Keep planning without losing momentum
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Export your schedule, revisit your intake, or jump back into saved plans.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <GoogleCalendarButton scheduleData={scheduleData} />
                <motion.button
                  onClick={() => navigate('/form')}
                  className={`${ACTION_BUTTON_CLASS} bg-blue-600 text-white hover:bg-blue-700`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Back to Form
                </motion.button>
                <motion.button
                  onClick={() => navigate('/saved-schedules')}
                  className={`${ACTION_BUTTON_CLASS} border border-slate-600 bg-slate-800 text-white hover:bg-slate-700`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Saved Schedules
                </motion.button>
                <motion.button
                  onClick={onSignOut}
                  className={`${ACTION_BUTTON_CLASS} cursor-pointer bg-red-600 text-white hover:bg-red-700`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Sign Out
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <motion.button
            onClick={handleScheduleEditorClick}
            className={`${PANEL_CLASS} group flex min-h-[188px] h-full cursor-pointer p-5 text-left transition duration-200 hover:border-blue-300/40 hover:bg-slate-900`}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.99 }}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-blue-400/30 bg-blue-400/10 p-3 text-blue-300">
                  <svg
                    className="h-6 w-6"
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
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">
                    AI Assistant
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Schedule Editor
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Move classes, swap terms, replace fillers, and refine your plan with guardrails.
                  </p>
                </div>
              </div>
              <span className="flex min-w-[126px] cursor-pointer items-center justify-center self-center rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-2 text-center text-sm font-medium text-blue-200">
                Edit plan
              </span>
            </div>
          </motion.button>

          <motion.button
            onClick={handleChatButtonClick}
            className={`${PANEL_CLASS} group flex min-h-[188px] h-full cursor-pointer p-5 text-left transition duration-200 hover:border-cyan-300/40 hover:bg-slate-900`}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.99 }}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-cyan-300">
                  <svg
                    className="h-6 w-6"
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
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                    AI Assistant
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Planning Assistant
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Ask about requirements, course sequencing, GE options, and your next best move.
                  </p>
                </div>
              </div>
              <span className="flex min-w-[126px] cursor-pointer items-center justify-center self-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-center text-sm font-medium text-cyan-200">
                Ask anything
              </span>
            </div>
          </motion.button>
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

        {/* Chat Interface */}
        {isChatOpen && (
          <motion.div
            className="fixed bottom-8 right-4 z-50 flex h-[620px] max-h-[calc(100vh-4rem)] w-[calc(100vw-2rem)] max-w-[440px] flex-col overflow-hidden rounded-3xl border border-slate-600/80 bg-slate-800/95 shadow-[0_30px_90px_rgba(2,8,23,0.55)] backdrop-blur-md sm:right-8"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            drag
            dragControls={planningDragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0.08}
            dragConstraints={{ top: -420, left: -900, right: 80, bottom: 120 }}
          >
            <div
              className="flex cursor-grab items-start justify-between border-b border-slate-700 bg-slate-900 p-4 active:cursor-grabbing"
              onPointerDown={(event) => planningDragControls.start(event)}
            >
              <div className="flex items-start space-x-3">
                <div className="mt-1 h-3 w-3 rounded-full bg-green-500"></div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">
                      AI Planning Assistant
                    </h3>
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">
                      Ask anything
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    Course guidance, requirement help, and quarter-planning support.
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Drag this window by the header
                  </p>
                </div>
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
            <div className="flex-1 overflow-hidden">
              <Chatbox scheduleData={scheduleData} />
            </div>
          </motion.div>
        )}

        {/* Schedule Editor Interface */}
        {isScheduleEditorOpen && (
          <motion.div
            className="fixed bottom-8 left-4 z-50 flex h-[620px] max-h-[calc(100vh-4rem)] w-[calc(100vw-2rem)] max-w-[460px] flex-col overflow-hidden rounded-3xl border border-slate-600/80 bg-slate-800/95 shadow-[0_30px_90px_rgba(2,8,23,0.55)] backdrop-blur-md sm:left-8"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            drag
            dragControls={editorDragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0.08}
            dragConstraints={{ top: -420, left: -80, right: 900, bottom: 120 }}
          >
            <div
              className="flex cursor-grab items-start justify-between border-b border-slate-700 bg-slate-900 p-4 active:cursor-grabbing"
              onPointerDown={(event) => editorDragControls.start(event)}
            >
              <div className="flex items-start space-x-3">
                <div className="mt-1 h-3 w-3 rounded-full bg-blue-500"></div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">
                      Schedule Editor
                    </h3>
                    <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[11px] font-medium text-blue-200">
                      Make changes
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">
                    Edit your plan with guided moves, swaps, GE replacements, and filler updates.
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Drag this window by the header
                  </p>
                </div>
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
            <div className="flex-1 overflow-hidden">
              <ScheduleEditChat scheduleData={scheduleData} onScheduleUpdate={onScheduleUpdate} />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
