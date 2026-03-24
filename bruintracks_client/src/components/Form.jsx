// src/components/MultiStepForm.js
import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import '../index.css';
import '../main.jsx';
import { motion } from 'framer-motion';
import '../App.css';
import { ArrowLeftCircle, ArrowRightCircle } from 'react-bootstrap-icons';
import { Dropdown } from './Dropdown.jsx';
import { InputField } from './InputField.jsx';
import { useNavigate } from 'react-router-dom';
import { handleSignOut } from '../supabaseClient.js';
import { useAuth } from '../AuthContext.jsx';
import { supabase } from '../supabaseClient.js';
import { apiUrl } from '../api.js';

const classes = {
  'COM SCI': [
    'COM SCI 31',
    'COM SCI 32',
    'COM SCI 33',
    'COM SCI 35L',
    'COM SCI M51A',
    'COM SCI 180',
    'COM SCI 111',
    'COM SCI 181',
    'COM SCI 118',
  ],
  'EC ENGR': ['EC ENGR 3', 'EC ENGR 100', 'EC ENGR 102', 'EC ENGR 115C'],
  MATH: [
    'MATH 31A',
    'MATH 31B',
    'MATH 32A',
    'MATH 32B',
    'MATH 33A',
    'MATH 33B',
    'MATH 42',
    'MATH 61',
    'MATH 70',
    'MATH 115A',
  ]
};

const FORM_ROW_CLASS =
  'mx-auto flex w-full max-w-[28rem] flex-col gap-2';
const FORM_ROW_WIDE_CLASS =
  'flex w-full flex-col gap-2';
const FORM_LABEL_CLASS =
  'text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200';
const FORM_CONTROL_CLASS =
  'h-13 w-full rounded-xl border border-slate-600 bg-slate-900/85 px-4 text-base text-white placeholder:text-slate-400 shadow-sm transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30';
const FORM_MENU_CLASS =
  'absolute left-0 top-[calc(100%+0.35rem)] z-50 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 shadow-2xl';
const FORM_TITLE_ALIGN_CLASS = 'w-full text-center';
const FORM_CHECKBOX_ROW_CLASS =
  'mx-auto flex w-full max-w-[34rem] items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-900/60 px-5 py-4';
const FORM_PANEL_CLASS =
  'rounded-[2rem] border border-slate-700/80 bg-slate-950/85 shadow-[0_30px_90px_rgba(2,8,23,0.5)] backdrop-blur-md';
const FORM_SUBPANEL_CLASS =
  'rounded-2xl border border-slate-700/70 bg-slate-900/70 shadow-lg';
const FALLBACK_SCHOOL_OPTIONS = [
  'Letters & Sciences',
  'Engineering',
  'Arts and Architecture',
  'Music',
  'Nursing',
  'Public Affairs',
  'Public Health',
  'Education & Information Studies',
  'Theater, Film and Television'
];

const normalizeSchoolLabel = (schoolName) => {
  const value = String(schoolName || '').trim();
  if (value.toLowerCase() === 'the college') {
    return 'Letters & Sciences';
  }
  return value;
};

const FormModal = ({
  children,
  handleClick,
  handleBackClick,
  validate,
  showNextArrow = true
}) => {
  const [isInvalid, setIsInvalid] = useState(false);

  return (
    <motion.div
      className={`${FORM_PANEL_CLASS} w-full max-w-[72rem] overflow-hidden`}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="border-b border-slate-800 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_35%)] px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
              BruinBot Intake
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
              Build a personalized UCLA plan using your academic path, completed coursework,
              schedule preferences, and planning constraints.
            </p>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300">
            Guided intake
          </div>
        </div>
      </div>
      <div className="flex flex-col space-y-6 px-6 py-6 text-white sm:px-8">
        {children}
        {isInvalid && (
          <span className="mx-auto rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-200">
            Make sure to complete all required fields.
          </span>
        )}
        <div className="mt-2 flex w-full items-center justify-between border-t border-slate-800 pt-4">
          {handleBackClick != null ? (
            <button
              onClick={handleBackClick}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-slate-200 transition hover:border-cyan-400/40 hover:text-white"
            >
              <ArrowLeftCircle size={30} />
              <span className="text-sm font-medium">Back</span>
            </button>
          ) : <div />}
          {showNextArrow && (
            <button
              onClick={
                validate
                  ? () => (validate() ? handleClick() : setIsInvalid(true))
                  : handleClick
              }
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-white transition hover:bg-blue-700"
            >
              <span className="text-sm font-semibold">Continue</span>
              <ArrowRightCircle size={24} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const Icebreaker = ({
  name = '',
  setName = () => {},
  school = '',
  setSchool = () => {},
  gradQuarter = '',
  setGradQuarter = () => {},
  gradYear = undefined,
  setGradYear = () => {},
  handleNextClick = () => {},
  validate = null
}) => {
  const [schoolOptions, setSchoolOptions] = useState(FALLBACK_SCHOOL_OPTIONS);

  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const response = await fetch(apiUrl('/schools'));
        if (!response.ok) {
          throw new Error('Failed to fetch schools');
        }
        const data = await response.json();
        const normalized = Array.from(
          new Set((data || []).map(normalizeSchoolLabel).filter(Boolean))
        );
        const nextOptions = normalized.length ? normalized : FALLBACK_SCHOOL_OPTIONS;
        setSchoolOptions(nextOptions);
        if (!school && nextOptions.length > 0) {
          setSchool(nextOptions[0]);
        }
      } catch {
        setSchoolOptions(FALLBACK_SCHOOL_OPTIONS);
        if (!school) {
          setSchool(FALLBACK_SCHOOL_OPTIONS[0]);
        }
      }
    };

    fetchSchools();
  }, [setSchool]);

  return (
    <FormModal handleClick={handleNextClick} validate={validate} handleBackClick={null}>
      <div className={FORM_TITLE_ALIGN_CLASS}>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Getting Started</p>
        <p className="mt-2 text-3xl font-bold text-white sm:text-4xl">Tell us about yourself</p>
        <p className="mt-2 text-base text-slate-300">
          We’ll use this to build a plan that matches your timeline and school requirements.
        </p>
      </div>
      <div className="mx-auto grid w-full max-w-4xl gap-5 md:grid-cols-2">
        <div className={FORM_ROW_WIDE_CLASS}>
          <label className={FORM_LABEL_CLASS}>Name:</label>
          <InputField
            type="text"
            defaultValue={name}
            setValue={setName}
            required
            placeholder="Jane Doe"
          />
        </div>
        <div className={FORM_ROW_WIDE_CLASS}>
          <label className={FORM_LABEL_CLASS}>School:</label>
          <Dropdown
            options={schoolOptions}
            onSelect={setSchool}
            defaultOption={school}
            placeholder="Select a school"
          />
        </div>
        <div className={FORM_ROW_WIDE_CLASS}>
          <label className={FORM_LABEL_CLASS}>Grad year:</label>
          <InputField
            type="number"
            defaultValue={gradYear || null}
            setValue={setGradYear}
            required
            placeholder="2030"
          />
        </div>
        <div className={FORM_ROW_WIDE_CLASS}>
          <label className={FORM_LABEL_CLASS}>Grad quarter:</label>
          <Dropdown
            options={['Fall', 'Winter', 'Spring']}
            onSelect={setGradQuarter}
            defaultOption={gradQuarter}
          />
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/45 px-4 py-3 text-sm text-slate-300">
        <span className="font-medium text-slate-100">What you&apos;ll add:</span>
        <span>Your academic profile, major plan, time preferences, and completed courses.</span>
      </div>
    </FormModal>
  );
};

const MajorAutocomplete = ({ school, major, setMajor, setMajorName }) => {
  const [options, setOptions] = useState([]);
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [schoolId, setSchoolId] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!school) return;
    // Map display label back to backend value for lookup
    let backendSchool = school;
    if (school === 'Letters & Sciences') {
      backendSchool = 'The College';
    }
    fetch(apiUrl('/schools'))
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(schools => {
        const schoolIndex = schools.findIndex(
          s => s.toLowerCase() === backendSchool.toLowerCase()
        );
        if (schoolIndex !== -1) {
          setSchoolId(schoolIndex + 1);
        } else {
          setSchoolId(null);
        }
      })
      .catch(() => setSchoolId(null));
  }, [school]);

  useEffect(() => {
    if (!schoolId) return;
    fetch(apiUrl(`/majors?school_id=${schoolId}`))
      .then(res => res.json())
      .then(data => {
        fetch(apiUrl('/majors/all'))
          .then(res2 => res2.json())
          .then(allMajors => {
            const filtered = allMajors.filter(m => data.includes(m.full_name));
            setOptions(filtered);
          });
      })
      .catch(() => setOptions([]));
  }, [schoolId]);

  const filtered = options.filter(opt =>
    opt.full_name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (!showDropdown) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(filtered.length ? 0 : -1);
  }, [showDropdown, filtered.length]);

  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      return;
    }

    if (!filtered.length) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex(prev => (prev + 1) % filtered.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex(prev => (prev <= 0 ? filtered.length - 1 : prev - 1));
      return;
    }

    if (e.key === 'Enter' && showDropdown) {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        const selected = filtered[activeIndex];
        setMajor(selected.full_name);
        setMajorName && setMajorName(selected.major_name);
        setShowDropdown(false);
      }
    }
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        value={major}
        onChange={e => {
          setQuery(e.target.value);
          setMajor(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        onKeyDown={onKeyDown}
        className={FORM_CONTROL_CLASS}
        placeholder="Search majors..."
        aria-haspopup="listbox"
        aria-expanded={showDropdown}
      />
      {showDropdown && filtered.length > 0 && (
        <div className={FORM_MENU_CLASS} role="listbox">
          {filtered.map((opt, index) => (
            <div
              key={opt.major_name}
              className={`cursor-pointer px-3 py-3 text-sm text-white ${
                index === activeIndex ? 'bg-cyan-400/15' : 'hover:bg-slate-800'
              }`}
              onClick={() => {
                setMajor(opt.full_name);
                setMajorName && setMajorName(opt.major_name);
                setShowDropdown(false);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              aria-selected={index === activeIndex}
            >
              {opt.full_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const InfoDetail = ({
  handleBackClick = () => {},
  handleNextClick = () => {},
  major = '',
  setMajor = () => {},
  setMajorName = () => {},
  wantsDbMajor = null,
  setWantsDbMajor = () => {},
  doubleMajor = '',
  setDoubleMajor = () => {},
  setDoubleMajorName = () => {},
  school = '',
  validate = () => {},
  techBreadth = '',
  setTechBreadth = () => {},
  secondTechBreadth = '',
  setSecondTechBreadth = () => {}
}) => {
  const [dbMajorSelect, setDbMajorSelect] = useState(wantsDbMajor);
  const [secondSchool, setSecondSchool] = useState('');
  const [techBreadthError, setTechBreadthError] = useState('');

  const showDbMajor = visible => {
    setWantsDbMajor(visible === 'Yep');
    setDbMajorSelect(visible === 'Yep');
  };

  const isEngineeringSchool = schoolName => {
    return schoolName === 'Engineering';
  };

  const getTechBreadthOptions = majorName => {
    const allOptions = [
      'Bioengineering',
      'Chemical & Biomolecular Engineering',
      'Civil & Environmental Engineering',
      'Computer Science',
      'Electrical & Computer Engineering',
      'Materials Science & Engineering',
      'Mechanical & Aerospace Engineering',
      'Computational Genomics',
      'Digital Humanities',
      'Energy and the Environment',
      'Engineering Mathematics',
      'Engineering Science',
      'Nanotechnology',
      'Pre-Med',
      'Technology Management',
      'Urban Planning'
    ];

    // Special case for Computer Engineering and CSE majors
    if (
      majorName === 'Computer Engineering' ||
      majorName === 'Computer Science and Engineering'
    ) {
      return allOptions;
    }

    // Filter out the major's own department
    return allOptions.filter(option => {
      if (majorName === 'Bioengineering' && option === 'Bioengineering')
        return false;
      if (
        majorName === 'Chemical Engineering' &&
        option === 'Chemical & Biomolecular Engineering'
      )
        return false;
      if (
        majorName === 'Civil Engineering' &&
        option === 'Civil & Environmental Engineering'
      )
        return false;
      if (majorName === 'Computer Science' && option === 'Computer Science')
        return false;
      if (
        majorName === 'Electrical Engineering' &&
        option === 'Electrical & Computer Engineering'
      )
        return false;
      if (
        majorName === 'Materials Science' &&
        option === 'Materials Science & Engineering'
      )
        return false;
      if (
        majorName === 'Mechanical Engineering' &&
        option === 'Mechanical & Aerospace Engineering'
      )
        return false;
      return true;
    });
  };

  const validateTechBreadth = () => {
    if (isEngineeringSchool(school) && !techBreadth) {
      setTechBreadthError('Please select a technical breadth area');
      return false;
    }
    if (isEngineeringSchool(secondSchool) && !secondTechBreadth) {
      setTechBreadthError(
        'Please select a technical breadth area for your second major'
      );
      return false;
    }
    setTechBreadthError('');
    return true;
  };

  return (
    <FormModal
      handleClick={() =>
        validateTechBreadth() && handleNextClick()
      }
      handleBackClick={handleBackClick}
      validate={validate}
    >
      <div className={FORM_TITLE_ALIGN_CLASS}>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Academic Profile</p>
        <p className="mt-3 text-4xl font-bold text-white">Tell us more</p>
        <p className="mt-3 text-base text-slate-300">
          Choose your major path so BruinBot can personalize requirements and technical breadth guidance.
        </p>
      </div>
      <div className="w-full flex flex-col gap-3">
        <div className={FORM_ROW_CLASS}>
          <label className={FORM_LABEL_CLASS}>Major:</label>
          <div className="w-full">
            <MajorAutocomplete
              school={school}
              major={major}
              setMajor={setMajor}
              setMajorName={setMajorName}
            />
          </div>
        </div>
        {isEngineeringSchool(school) && (
          <div className={FORM_ROW_CLASS}>
            <label className={FORM_LABEL_CLASS}>Technical Breadth Area:</label>
            <div className="w-full">
              <Dropdown
                options={getTechBreadthOptions(major)}
                onSelect={setTechBreadth}
                defaultOption={techBreadth}
                placeholder="Select a technical breadth area"
              />
            </div>
          </div>
        )}
        <div className={FORM_ROW_CLASS}>
          <label className={FORM_LABEL_CLASS}>Double major?</label>
          <Dropdown
            options={['Yep', 'No, thanks']}
            onSelect={showDbMajor}
            defaultOption={
              wantsDbMajor != null ? (wantsDbMajor ? 'Yep' : 'No, thanks') : undefined
            }
          />
        </div>
        {dbMajorSelect && (
          <>
            <div className={FORM_ROW_CLASS}>
              <label className={FORM_LABEL_CLASS}>Second School:</label>
              <Dropdown
                options={[
                  'Arts & Architecture',
                  'Letters & Sciences',
                  'Education & Information Studies',
                  'Engineering',
                  'Music',
                  'Nursing',
                  'Public Affairs',
                  'Theater, Film & Television'
                ]}
                onSelect={setSecondSchool}
                defaultOption={secondSchool}
              />
            </div>
            <div className={FORM_ROW_CLASS}>
              <label className={FORM_LABEL_CLASS}>Second Major:</label>
              <div className="w-full">
                <MajorAutocomplete
                  school={secondSchool}
                  major={doubleMajor}
                  setMajor={setDoubleMajor}
                  setMajorName={setDoubleMajorName}
                />
              </div>
            </div>
            {isEngineeringSchool(secondSchool) && (
              <div className={FORM_ROW_CLASS}>
                <label className={FORM_LABEL_CLASS}>
                  Second Major Technical Breadth Area:
                </label>
                <div className="w-full">
                  <Dropdown
                    options={getTechBreadthOptions(doubleMajor)}
                    onSelect={setSecondTechBreadth}
                    defaultOption={secondTechBreadth}
                    placeholder="Select a technical breadth area"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {techBreadthError && (
        <div className="text-red-600 font-semibold mt-4">
          {techBreadthError}
        </div>
      )}
    </FormModal>
  );
};

const daysOfWeek = ['M', 'T', 'W', 'Th', 'F'];

const SchedulePreferences = ({
  prefNoDays,
  setPrefNoDays,
  earliestClassTime,
  setEarliestClassTime,
  latestClassTime,
  setLatestClassTime,
  handleNextClick = () => {},
  handleBackClick = () => {},
  validate = () => {}
}) => {
  const toggleDay = day => {
    if (prefNoDays.includes(day)) {
      setPrefNoDays(prefNoDays.filter(d => d !== day));
    } else {
      setPrefNoDays([...prefNoDays, day]);
    }
  };

  return (
    <FormModal handleClick={handleNextClick} handleBackClick={handleBackClick} validate={validate}>
      <div className="p-4">
        <div className={`${FORM_ROW_CLASS} mb-4`}>
          <label className={FORM_LABEL_CLASS}>Prefer no class days on:</label>
          <div className="flex flex-row gap-2">
            {daysOfWeek.map((day, idx) => (
              <button
                key={idx}
                type="button"
                className={`px-3 py-1 rounded-lg border transition ${
                  prefNoDays.includes(day)
                    ? 'border-cyan-400 bg-cyan-400/15 text-cyan-100 ring-2 ring-cyan-400/30'
                    : 'border-slate-600 bg-slate-900/70 text-slate-200 hover:border-slate-500'
                }`}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={FORM_ROW_CLASS}>
        <label className={FORM_LABEL_CLASS}>Earliest start time:</label>
        <InputField
          type="time"
          defaultValue={earliestClassTime}
          setValue={setEarliestClassTime}
          required
          placeholder="HH:MM"
        />
      </div>
      <div className={FORM_ROW_CLASS}>
        <label className={FORM_LABEL_CLASS}>Latest end time:</label>
        <InputField
          type="time"
          defaultValue={latestClassTime}
          setValue={setLatestClassTime}
          required
          placeholder="HH:MM"
        />
      </div>
    </FormModal>
  );
};

const InstructorAutocomplete = ({ selected, setSelected }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const timeoutRef = useRef();

  const fetchInstructors = async q => {
    if (!q) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(
        apiUrl(`/instructors/search?q=${encodeURIComponent(q)}`)
      );
      const data = await res.json();
      setResults(data.filter(name => !selected.includes(name)));
    } catch {
      setResults([]);
    }
  };

  const onChange = e => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => fetchInstructors(val), 200);
    setShowDropdown(true);
  };

  const onSelect = name => {
    setSelected([...selected, name]);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  const onRemove = name => {
    setSelected(selected.filter(n => n !== name));
  };

  useEffect(() => {
    if (!showDropdown) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(results.length ? 0 : -1);
  }, [showDropdown, results.length]);

  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      return;
    }

    if (!results.length) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex(prev => (prev + 1) % results.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex(prev => (prev <= 0 ? results.length - 1 : prev - 1));
      return;
    }

    if (e.key === 'Enter' && showDropdown) {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        onSelect(results[activeIndex]);
      }
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap gap-2 mb-1">
        {selected.map(name => (
          <span key={name} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-white">
            {name}
            <button onClick={() => onRemove(name)} className="ml-1 text-white">
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={query}
        onChange={onChange}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={onKeyDown}
        className={FORM_CONTROL_CLASS}
        placeholder="Search instructors..."
        aria-haspopup="listbox"
        aria-expanded={showDropdown}
      />
      {showDropdown && results.length > 0 && (
        <div className={FORM_MENU_CLASS} role="listbox">
          {results.map((name, index) => (
            <div
              key={name}
              className={`cursor-pointer px-3 py-3 text-sm text-white ${
                index === activeIndex ? 'bg-cyan-400/15' : 'hover:bg-slate-800'
              }`}
              onClick={() => onSelect(name)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              aria-selected={index === activeIndex}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BuildingDropdown = ({ selected, setSelected }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const timeoutRef = useRef();

  const fetchBuildings = async q => {
    if (!q) {
      setResults([]);
      return;
    }
    try {
      const res = await fetch(
        apiUrl(`/courses/buildings/search?q=${encodeURIComponent(q)}`)
      );
      const data = await res.json();
      setResults(data.filter(name => !selected.includes(name)));
    } catch {
      setResults([]);
    }
  };

  const addBuilding = value => {
    if (!value || selected.includes(value)) return;
    setSelected([...selected, value]);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    setActiveIndex(-1);
  };

  const removeBuilding = value => {
    setSelected(selected.filter(b => b !== value));
  };

  const onChange = e => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => fetchBuildings(val), 200);
    setShowDropdown(true);
  };

  useEffect(() => {
    if (!showDropdown) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(results.length ? 0 : -1);
  }, [showDropdown, results.length]);

  const onKeyDown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      return;
    }

    if (!results.length) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex(prev => (prev + 1) % results.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShowDropdown(true);
      setActiveIndex(prev => (prev <= 0 ? results.length - 1 : prev - 1));
      return;
    }

    if (e.key === 'Enter' && showDropdown) {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        addBuilding(results[activeIndex]);
      }
    }
  };

  return (
    <div className="relative w-full">
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map(building => (
          <span key={building} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-white">
            {building}
            <button
              type="button"
              onClick={() => removeBuilding(building)}
              className="ml-1 text-white"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={query}
        onChange={onChange}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={onKeyDown}
        className={`${FORM_CONTROL_CLASS} w-full`}
        placeholder="Search buildings..."
        aria-haspopup="listbox"
        aria-expanded={showDropdown}
      />
      {showDropdown && results.length > 0 && (
        <div className={FORM_MENU_CLASS} role="listbox">
          {results.map((name, index) => (
            <div
              key={name}
              className={`cursor-pointer px-3 py-3 text-sm text-white ${
                index === activeIndex ? 'bg-cyan-400/15' : 'hover:bg-slate-800'
              }`}
              onClick={() => addBuilding(name)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              aria-selected={index === activeIndex}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const GeInterestsInput = ({ selected, setSelected }) => {
  const [query, setQuery] = useState('');

  const addInterest = (value) => {
    const cleaned = String(value || '').trim();
    if (!cleaned || selected.includes(cleaned)) return;
    setSelected([...selected, cleaned]);
    setQuery('');
  };

  const removeInterest = (value) => {
    setSelected(selected.filter(i => i !== value));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addInterest(query);
    }
  };

  const onPaste = (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (!pasted.includes(',')) return;
    e.preventDefault();
    const values = pasted
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    const next = [...selected];
    values.forEach((value) => {
      if (!next.includes(value)) {
        next.push(value);
      }
    });
    setSelected(next);
    setQuery('');
  };

  return (
    <div className="w-full">
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map(interest => (
          <span key={interest} className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-white">
            {interest}
            <button
              type="button"
              onClick={() => removeInterest(interest)}
              className="ml-1 text-white"
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addInterest(query)}
        onPaste={onPaste}
        className={`${FORM_CONTROL_CLASS} w-full`}
        placeholder="(linguistics, robotics, etc.)"
      />
    </div>
  );
};

const PreferencesStep = ({
  leastCoursesPerTerm,
  setLeastCoursesPerTerm,
  maxCoursesPerTerm,
  setMaxCoursesPerTerm,
  prefInstructors,
  setPrefInstructors,
  prefBuildings,
  setPrefBuildings,
  geInterests,
  setGeInterests,
  handleNextClick,
  handleBackClick
}) => {
  const isValid =
    maxCoursesPerTerm > leastCoursesPerTerm &&
    maxCoursesPerTerm <= 6 &&
    leastCoursesPerTerm >= 1;

  let errorMsg = '';
  if (maxCoursesPerTerm <= leastCoursesPerTerm) {
    errorMsg = 'Max courses per term must be greater than least courses per term.';
  } else if (maxCoursesPerTerm > 6) {
    errorMsg = 'Max courses per term cannot exceed 6.';
  }

  return (
    <FormModal handleClick={isValid ? handleNextClick : () => {}} handleBackClick={handleBackClick}>
      <div className="p-4 flex flex-col gap-6">
        <div className={FORM_ROW_CLASS}>
          <label className={FORM_LABEL_CLASS}>Least courses per term:</label>
          <input
            type="number"
            min={1}
            value={leastCoursesPerTerm}
            onChange={e => setLeastCoursesPerTerm(Number(e.target.value))}
            className={`${FORM_CONTROL_CLASS} max-w-28`}
          />
        </div>
        <div className={FORM_ROW_CLASS}>
          <label className={FORM_LABEL_CLASS}>Max courses per term:</label>
          <input
            type="number"
            min={1}
            value={maxCoursesPerTerm}
            onChange={e => setMaxCoursesPerTerm(Number(e.target.value))}
            className={`${FORM_CONTROL_CLASS} max-w-28`}
          />
        </div>
        {errorMsg && <div className="text-red-600 font-semibold">{errorMsg}</div>}
        <div className={FORM_ROW_CLASS}>
          <label className={FORM_LABEL_CLASS}>Preferred instructors:</label>
          <div className="w-full">
            <InstructorAutocomplete selected={prefInstructors} setSelected={setPrefInstructors} />
          </div>
        </div>
        <div className={FORM_ROW_CLASS}>
          <label className={FORM_LABEL_CLASS}>Preferred buildings:</label>
          <BuildingDropdown selected={prefBuildings} setSelected={setPrefBuildings} />
        </div>
        <div className={FORM_ROW_CLASS}>
          <label className={FORM_LABEL_CLASS}>GE interests:</label>
          <GeInterestsInput selected={geInterests} setSelected={setGeInterests} />
        </div>
      </div>
    </FormModal>
  );
};

const AdvancedPreferencesStep = ({
  allowWarnings,
  setAllowWarnings,
  allowPrimaryConflicts,
  setAllowPrimaryConflicts,
  allowSecondaryConflicts,
  setAllowSecondaryConflicts,
  prefPriority,
  setPrefPriority,
  handleNextClick,
  handleBackClick
}) => {
  // Drag and drop logic
  const [draggedIdx, setDraggedIdx] = useState(null);

  const onDragStart = idx => setDraggedIdx(idx);
  const onDragOver = e => e.preventDefault();
  const onDrop = idx => {
    if (draggedIdx === null || draggedIdx === idx) return;
    const newOrder = [...prefPriority];
    const [removed] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(idx, 0, removed);
    setPrefPriority(newOrder);
    setDraggedIdx(null);
  };

  return (
    <FormModal handleClick={handleNextClick} handleBackClick={handleBackClick}>
      <div className="p-4 flex flex-col gap-6">
        <div className={FORM_CHECKBOX_ROW_CLASS}>
          <label className="text-xl text-center">Ignore unenforced requisites</label>
          <input
            type="checkbox"
            checked={allowWarnings}
            onChange={e => setAllowWarnings(e.target.checked)}
            className="h-6 w-6 accent-cyan-400"
          />
        </div>
        <div className={FORM_CHECKBOX_ROW_CLASS}>
          <label className="text-xl text-center">Allow lecture conflicts</label>
          <input
            type="checkbox"
            checked={allowPrimaryConflicts}
            onChange={e => setAllowPrimaryConflicts(e.target.checked)}
            className="h-6 w-6 accent-cyan-400"
          />
        </div>
        <div className={FORM_CHECKBOX_ROW_CLASS}>
          <label className="text-xl text-center">Allow discussion conflicts</label>
          <input
            type="checkbox"
            checked={allowSecondaryConflicts}
            onChange={e => setAllowSecondaryConflicts(e.target.checked)}
            className="h-6 w-6 accent-cyan-400"
          />
        </div>
        <div className="flex flex-col gap-2 mt-4">
          <label className="text-xl mb-2 text-center">Rank your preferences (drag to reorder):</label>
          {prefPriority.map((item, idx) => (
            <div
              key={item}
              draggable
              onDragStart={() => onDragStart(idx)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(idx)}
              className={`flex cursor-move items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 shadow ${
                draggedIdx === idx ? 'opacity-50' : ''
              }`}
              style={{ userSelect: 'none' }}
            >
              <span className="w-32 capitalize">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </FormModal>
  );
};

export const ClassSelect = ({
  defaultDept = 'COM SCI',
  columns = 4,
  handleNextClick = () => {},
  handleBackClick = () => {}
}) => {
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [dept, setDept] = useState(defaultDept);
  const [myClasses, setMyClasses] = useState([]);

  const toggleItem = item => {
    setSelectedItems(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(item)) {
        newSelection.delete(item);
      } else {
        newSelection.add(item);
      }
      return newSelection;
    });
  };

  useEffect(() => {
    fetch(apiUrl('/get_courses'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        majorName: 'ComputerScienceBS'
      })
    })
      .then(res => res.json())
      .then(res => {
        setMyClasses(res);
      });
  }, []);


  return (
    <FormModal handleClick={handleNextClick} handleBackClick={handleBackClick}>
      <div className="p-4">
        <Dropdown
          options={['ALL', 'My Major', 'COM SCI', 'EC ENGR', 'MATH']}
          onSelect={setDept}
          defaultOption={dept}
          placeholder={'Department'}
        />

        <div className="max-h-50 overflow-y-auto">
          <div
            className={`grid gap-2`}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {(dept == 'My Major'
              ? myClasses
              : dept != 'ALL'
              ? classes[dept]
              : Object.values(classes).flat()
            ).map((item, index) => (
              <div
                key={index}
                className={`cursor-pointer rounded-xl border px-4 pb-2 pt-2 text-center transition ${
                  selectedItems.has(item)
                    ? 'border-cyan-400/40 bg-cyan-400/15 text-white'
                    : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-500'
                }`}
                onClick={() => toggleItem(item)}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 p-2 border rounded">
          <strong>In-progress/completed classes:</strong>{' '}
          {Array.from(selectedItems).join(', ') || 'None'}
        </div>
      </div>
    </FormModal>
  );
};

const SummaryView = ({ data = {}, handleBackClick = () => {}, setStep = () => {} }) => {
  const { session } = useAuth();
  const navigate = useNavigate();

  const handleCreateProfile = async () => {
    if (!session || !session.user) {
      return false;
    }

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('profile_id')
      .eq('profile_id', session.user.id)
      .single();

    // Only create profile if it doesn't exist
    if (!existingProfile) {
      const { error } = await supabase.from('profiles').insert([
        {
          profile_id: session.user.id,
          complete: true,
          full_name: "hi",
          created_at: "hi"
        },
      ]);

      if (error) {
        return false;
      }
    }

    return true;
  };

  const handleGenerateSchedule = async () => {
    try {
      const profileReady = await handleCreateProfile();
      if (!profileReady) {
        navigate('/');
        return;
      }

      // Set isGenerating flag in localStorage and navigate to loading page
      localStorage.setItem(
        'scheduleData',
        JSON.stringify({ isGenerating: true, startedAt: Date.now() })
      );
      navigate('/schedule');

      // Get selected majors
      const selectedMajors = [data.majorName];
      if (data.doubleMajorName) {
        selectedMajors.push(data.doubleMajorName);
      }

      // Check for session
      if (!session || !session.access_token) {
        // Redirect to login if no session
        navigate('/');
        return;
      }

      // Fetch major requisites from Supabase
      const { data: majorRequisites, error: supabaseError } = await supabase
        .from('major_requisites')
        .select('json_data')
        .in('major_name', selectedMajors);

      if (supabaseError) {
        return;
      }

      if (!majorRequisites || majorRequisites.length === 0) {
        return;
      }

      // Process the JSON data from each major
      const processedRequirements = majorRequisites.map(req => {
        return req.json_data;
      });

      // Call the get-courses-to-schedule endpoint (can take several minutes)
      const response = await fetch(apiUrl('/courses/get-courses-to-schedule'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          jsonData: processedRequirements,
          school: data.school,
          transcript: data.transcript,
          grad_year: data.gradYear,
          grad_quarter: data.gradQuarter,
          preferences: {
            allow_warnings: data.allowWarnings,
            allow_primary_conflicts: data.allowPrimaryConflicts,
            allow_secondary_conflicts: data.allowSecondaryConflicts,
            pref_priority: data.prefPriority,
            pref_earliest: data.earliestClassTime,
            pref_latest: data.latestClassTime,
            pref_no_days: data.prefNoDays,
            pref_buildings: data.prefBuildings,
            pref_instructors: data.prefInstructors,
            ge_interests: data.geInterests,
            max_courses_per_term: data.maxCoursesPerTerm,
            least_courses_per_term: data.leastCoursesPerTerm,
            tech_breadth: data.techBreadth,
            second_tech_breadth: data.secondTechBreadth
          }
        }),
      });
      if (!response.ok) {
        await response.text();
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const scheduleData = await response.json();

      // Store schedule data in localStorage with isGenerating set to false
      localStorage.setItem('scheduleData', JSON.stringify({
        ...scheduleData,
        isGenerating: false,
        school: data.school,
        transcript: data.transcript,
        preferences: {
          allow_warnings: data.allowWarnings,
          allow_primary_conflicts: data.allowPrimaryConflicts,
          allow_secondary_conflicts: data.allowSecondaryConflicts,
          pref_priority: data.prefPriority,
          pref_earliest: data.earliestClassTime,
          pref_latest: data.latestClassTime,
          pref_no_days: data.prefNoDays,
          pref_buildings: data.prefBuildings,
          pref_instructors: data.prefInstructors,
          ge_interests: data.geInterests,
          max_courses_per_term: data.maxCoursesPerTerm,
          least_courses_per_term: data.leastCoursesPerTerm,
          tech_breadth: data.techBreadth,
          second_tech_breadth: data.secondTechBreadth
        }
      }));

      // Keep user on schedule page once generation finishes
      navigate('/schedule', { replace: true });
    } catch {
      // Preserve the attempt metadata so the schedule page does not bounce back
      // to the welcome state if the request was interrupted mid-generation.
      try {
        const existing = JSON.parse(localStorage.getItem('scheduleData') || '{}');
        localStorage.setItem(
          'scheduleData',
          JSON.stringify({
            ...existing,
            isGenerating: false,
            generationError: true,
            generationErrorAt: Date.now()
          })
        );
      } catch {
        localStorage.setItem(
          'scheduleData',
          JSON.stringify({
            isGenerating: false,
            generationError: true,
            generationErrorAt: Date.now()
          })
        );
      }
      // Keep user on schedule page even when generation fails
      navigate('/schedule', { replace: true });
    }
  };

  return (
    <FormModal
      handleClick={handleGenerateSchedule}
      handleBackClick={handleBackClick}
      showNextArrow={false}
    >
      <div className="w-full text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Final Review</p>
        <p className="mt-3 text-4xl font-bold text-white">Registration Summary</p>
      </div>
      <div className="flex flex-col">
        <motion.div
          className={`${FORM_SUBPANEL_CLASS} mb-5 flex flex-col p-5 text-slate-200`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4, borderColor: 'rgba(34,211,238,0.35)' }}
        >
          <a onClick={() => setStep(1)} className="cursor-pointer text-cyan-300 underline underline-offset-4">
            Edit
          </a>
          <span>
            <strong>Full name:</strong> {data.fullName}
          </span>
          <span>
            <strong>School:</strong> {data.school}
          </span>
          <span>
            <strong>Graduation:</strong> {data.gradQuarter} {data.gradYear}
          </span>
        </motion.div>
        <motion.div
          className={`${FORM_SUBPANEL_CLASS} mb-5 flex flex-col p-5 text-slate-200`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4, borderColor: 'rgba(34,211,238,0.35)' }}
        >
          <a onClick={() => setStep(2)} className="cursor-pointer text-cyan-300 underline underline-offset-4">
            Edit
          </a>
          <span>
            <strong>Major:</strong> {data.major}
          </span>
          {data.techBreadth && (
            <span>
              <strong>Technical Breadth Area:</strong> {data.techBreadth}
            </span>
          )}
          {data.wantsDbMajor ? (
            <>
              <span>
                <strong>Double major:</strong> {data.doubleMajor}
              </span>
              {data.secondTechBreadth && (
                <span>
                  <strong>Second Major Technical Breadth Area:</strong>{' '}
                  {data.secondTechBreadth}
                </span>
              )}
            </>
          ) : null}
        </motion.div>
        <motion.div
          className={`${FORM_SUBPANEL_CLASS} flex flex-col p-5 text-slate-200`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -4, borderColor: 'rgba(34,211,238,0.35)' }}
        >
          <a onClick={() => setStep(3)} className="cursor-pointer text-cyan-300 underline underline-offset-4">
            Edit
          </a>
          <span>
            <strong>Prefer no class days on:</strong> {data.prefNoDays.join(', ')}
          </span>
          <span>
            <strong>Earliest start time:</strong> {data.earliestClassTime}
          </span>
          <span>
            <strong>Latest end time:</strong> {data.latestClassTime}
          </span>
        </motion.div>
      </div>
      <button
        onClick={() => {
          handleGenerateSchedule();
        }}
        className="mt-4 inline-flex items-center justify-center rounded-lg !bg-[#0b1f4f] px-5 py-3 font-semibold !text-white shadow transition hover:!bg-[#12387a] focus:outline-none focus:ring-2 focus:ring-[#1f4ca8]"
        style={{ backgroundColor: '#2563eb', color: '#fff' }}
      >
        Generate Schedule
      </button>
    </FormModal>
  );
};

// Grade options for transcript
const gradeOptions = [
  'A+',
  'A',
  'A-',
  'B+',
  'B',
  'B-',
  'C+',
  'C',
  'C-',
  'D+',
  'D',
  'D-',
  'F'
];

const TranscriptStep = ({
  transcript,
  setTranscript,
  handleNextClick,
  handleBackClick,
  majorName,
  doubleMajorName
}) => {
  const [selectedCourses, setSelectedCourses] = useState(Object.keys(transcript));
  const [availableCourses, setAvailableCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState('All');

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const majors = [majorName].filter(Boolean);
        if (doubleMajorName) {
          majors.push(doubleMajorName);
        }
        const response = await fetch(apiUrl('/courses/by-majors'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ majors })
        });
        if (!response.ok) {
          throw new Error('Failed to fetch courses');
        }
        const courses = await response.json();
        setAvailableCourses(courses);
      } catch {
        setAvailableCourses([]);
      } finally {
        setLoading(false);
      }
    };
    if (majorName) {
      fetchCourses();
    }
  }, [majorName, doubleMajorName]);

  const toggleCourse = course => {
    let newSelected;
    if (selectedCourses.includes(course)) {
      newSelected = selectedCourses.filter(c => c !== course);
      const newTranscript = { ...transcript };
      delete newTranscript[course];
      setTranscript(newTranscript);
    } else {
      newSelected = [...selectedCourses, course];
      setTranscript({ ...transcript, [course]: 'A' }); // default grade
    }
    setSelectedCourses(newSelected);
  };

  const setGrade = (course, grade) => {
    setTranscript({ ...transcript, [course]: grade });
  };

  const getSubjectFromCourse = course => {
    const parts = String(course).trim().split(/\s+/);
    if (parts.length <= 1) {
      return String(course).trim();
    }
    return parts.slice(0, -1).join(' ');
  };

  const subjects = [
    'All',
    ...new Set(availableCourses.map(getSubjectFromCourse))
  ];

  const filteredCourses =
    selectedSubject === 'All'
      ? availableCourses
      : availableCourses.filter(course => getSubjectFromCourse(course) === selectedSubject);

  if (loading) {
    return (
      <FormModal handleClick={handleNextClick} handleBackClick={handleBackClick}>
        <div className="p-4 text-center">
          <p>Loading courses...</p>
        </div>
      </FormModal>
    );
  }

  return (
    <FormModal handleClick={handleNextClick} handleBackClick={handleBackClick}>
      <div className="p-4">
        <div className="mb-5 text-center">
          <strong className="text-white">Select completed courses and assign a grade:</strong>
        </div>
        <div className="mx-auto mb-6 flex w-full max-w-3xl flex-col items-center gap-2">
          <label className={FORM_LABEL_CLASS}>Filter by subject:</label>
          <select
            value={selectedSubject}
            onChange={e => setSelectedSubject(e.target.value)}
            className={`${FORM_CONTROL_CLASS} w-full max-w-[22rem] text-center`}
          >
            {subjects.map(subject => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-4 grid max-h-60 grid-cols-3 gap-2 overflow-y-auto">
          {filteredCourses.map((course, idx) => {
            const isSelected = selectedCourses.includes(course);
            return (
              <div
                key={idx}
                className={`cursor-pointer rounded-xl border px-4 pb-2 pt-2 text-center transition ${
                  isSelected
                    ? 'border-cyan-400/40 bg-cyan-400/15 text-white'
                    : 'border-slate-700 bg-slate-900/60 text-slate-200 hover:border-slate-500'
                }`}
                onClick={() => toggleCourse(course)}
              >
                <div>{course}</div>
                {isSelected && (
                  <div className="mt-2">
                    <select
                      value={transcript[course] || 'A'}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setGrade(course, e.target.value)}
                      className="h-9 rounded-md border border-slate-600 bg-slate-950 px-2 text-center text-sm text-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                    >
                      {gradeOptions.map(g => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </FormModal>
  );
};

FormModal.propTypes = {
  children: PropTypes.node,
  handleClick: PropTypes.func,
  handleBackClick: PropTypes.func,
  validate: PropTypes.func,
  showNextArrow: PropTypes.bool
};

Icebreaker.propTypes = {
  name: PropTypes.string,
  setName: PropTypes.func,
  school: PropTypes.string,
  setSchool: PropTypes.func,
  gradQuarter: PropTypes.string,
  setGradQuarter: PropTypes.func,
  gradYear: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([undefined, null])]),
  setGradYear: PropTypes.func,
  handleNextClick: PropTypes.func,
  validate: PropTypes.func
};

MajorAutocomplete.propTypes = {
  school: PropTypes.string,
  major: PropTypes.string,
  setMajor: PropTypes.func,
  setMajorName: PropTypes.func
};

InfoDetail.propTypes = {
  handleBackClick: PropTypes.func,
  handleNextClick: PropTypes.func,
  major: PropTypes.string,
  setMajor: PropTypes.func,
  setMajorName: PropTypes.func,
  wantsDbMajor: PropTypes.bool,
  setWantsDbMajor: PropTypes.func,
  doubleMajor: PropTypes.string,
  setDoubleMajor: PropTypes.func,
  setDoubleMajorName: PropTypes.func,
  school: PropTypes.string,
  validate: PropTypes.func,
  techBreadth: PropTypes.string,
  setTechBreadth: PropTypes.func,
  secondTechBreadth: PropTypes.string,
  setSecondTechBreadth: PropTypes.func
};

SchedulePreferences.propTypes = {
  prefNoDays: PropTypes.arrayOf(PropTypes.string),
  setPrefNoDays: PropTypes.func,
  earliestClassTime: PropTypes.string,
  setEarliestClassTime: PropTypes.func,
  latestClassTime: PropTypes.string,
  setLatestClassTime: PropTypes.func,
  handleNextClick: PropTypes.func,
  handleBackClick: PropTypes.func,
  validate: PropTypes.func
};

InstructorAutocomplete.propTypes = {
  selected: PropTypes.arrayOf(PropTypes.string),
  setSelected: PropTypes.func
};

BuildingDropdown.propTypes = {
  selected: PropTypes.arrayOf(PropTypes.string),
  setSelected: PropTypes.func
};

GeInterestsInput.propTypes = {
  selected: PropTypes.arrayOf(PropTypes.string),
  setSelected: PropTypes.func
};

PreferencesStep.propTypes = {
  leastCoursesPerTerm: PropTypes.number,
  setLeastCoursesPerTerm: PropTypes.func,
  maxCoursesPerTerm: PropTypes.number,
  setMaxCoursesPerTerm: PropTypes.func,
  prefInstructors: PropTypes.arrayOf(PropTypes.string),
  setPrefInstructors: PropTypes.func,
  prefBuildings: PropTypes.arrayOf(PropTypes.string),
  setPrefBuildings: PropTypes.func,
  geInterests: PropTypes.arrayOf(PropTypes.string),
  setGeInterests: PropTypes.func,
  handleNextClick: PropTypes.func,
  handleBackClick: PropTypes.func
};

AdvancedPreferencesStep.propTypes = {
  allowWarnings: PropTypes.bool,
  setAllowWarnings: PropTypes.func,
  allowPrimaryConflicts: PropTypes.bool,
  setAllowPrimaryConflicts: PropTypes.func,
  allowSecondaryConflicts: PropTypes.bool,
  setAllowSecondaryConflicts: PropTypes.func,
  prefPriority: PropTypes.arrayOf(PropTypes.string),
  setPrefPriority: PropTypes.func,
  handleNextClick: PropTypes.func,
  handleBackClick: PropTypes.func
};

ClassSelect.propTypes = {
  defaultDept: PropTypes.string,
  columns: PropTypes.number,
  handleNextClick: PropTypes.func,
  handleBackClick: PropTypes.func
};

SummaryView.propTypes = {
  data: PropTypes.object,
  handleBackClick: PropTypes.func,
  setStep: PropTypes.func
};

TranscriptStep.propTypes = {
  transcript: PropTypes.objectOf(PropTypes.string),
  setTranscript: PropTypes.func,
  handleNextClick: PropTypes.func,
  handleBackClick: PropTypes.func,
  majorName: PropTypes.string,
  doubleMajorName: PropTypes.string
};

export const Form = () => {
  const [step, setStep] = useState(1);
  useEffect(() => {
    setStep(1);
  }, []);
  const handleNextClick = () => setStep(step + 1);
  const handleBackClick = () => setStep(step - 1);

  const [fullName, setFullName] = useState('');
  const [school, setSchool] = useState('Engineering');
  const [gradQuarter, setGradQuarter] = useState('');
  const [gradYear, setGradYear] = useState(null);
  const [major, setMajor] = useState('');
  const [majorName, setMajorName] = useState('');
  const [wantsDbMajor, setWantsDbMajor] = useState(null);
  const [doubleMajor, setDoubleMajor] = useState('');
  const [doubleMajorName, setDoubleMajorName] = useState('');
  const [earliestClassTime, setEarliestClassTime] = useState(null);
  const [latestClassTime, setLatestClassTime] = useState(null);
  const [techBreadth, setTechBreadth] = useState('');
  const [secondTechBreadth, setSecondTechBreadth] = useState('');

  // Transcript: { 'COM SCI|31': 'A', ... }
  const [transcript, setTranscript] = useState({});

  // Preferences (default to unchecked)
  const [allowWarnings, setAllowWarnings] = useState(false);
  const [allowPrimaryConflicts, setAllowPrimaryConflicts] = useState(false);
  const [allowSecondaryConflicts, setAllowSecondaryConflicts] = useState(false);
  const [prefPriority, setPrefPriority] = useState([
    'time',
    'building',
    'days',
    'instructor'
  ]);
  const [prefNoDays, setPrefNoDays] = useState([]); // e.g. ['F']
  const [prefBuildings, setPrefBuildings] = useState([]); // e.g. ['MS', 'SCI']
  const [prefInstructors, setPrefInstructors] = useState([]); // e.g. ['Smith']
  const [geInterests, setGeInterests] = useState([]);
  const [maxCoursesPerTerm, setMaxCoursesPerTerm] = useState(5);
  const [leastCoursesPerTerm, setLeastCoursesPerTerm] = useState(3);

  const icebreakerValidate = () => {
    return (
      fullName.length > 0 &&
      school &&
      school.length > 0 &&
      ['Fall', 'Winter', 'Spring'].includes(gradQuarter) &&
      gradYear > 2023 &&
      gradYear < 2040
    );
  };

  const infoDetailValidate = () => {
    return (
      major.length > 0 && // Check if major is not empty
      (!wantsDbMajor || (wantsDbMajor && doubleMajor.length > 0))
    ); // If double major is selected, check if second major is not empty
  };

  const scheduleValidate = () => {
    return earliestClassTime != null && latestClassTime != null;
  };

  const navigate = useNavigate();
  const onSignOut = async () => {
    await handleSignOut();
    navigate('/');
  };

  const totalSteps = 7;
  const progressPercent = Math.min(100, Math.max(0, (step / totalSteps) * 100));

  return (
    <div className="relative min-h-screen w-screen overflow-y-auto bg-slate-950 px-4 pb-8 pt-16 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_28%),radial-gradient(circle_at_85%_15%,_rgba(59,130,246,0.10),_transparent_24%)]" />
      <button
        onClick={onSignOut}
        className="absolute right-6 top-5 z-50 cursor-pointer rounded-xl border border-slate-600 bg-slate-900/85 px-4 py-2 text-white shadow hover:bg-slate-800"
      >
        Sign Out
      </button>
      <div className="absolute left-1/2 top-5 z-40 w-[min(88vw,36rem)] -translate-x-1/2">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-slate-200">
          <span>Step {step} of {totalSteps}</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="relative mx-auto mt-10 w-full max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              BruinBot Planner
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
              Build your UCLA schedule faster
            </h1>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-300">
            Guided intake with assistant-ready preferences
          </div>
        </div>
        <div className="flex justify-center">
      {step === 1 && (
        <Icebreaker
          handleNextClick={handleNextClick}
          name={fullName}
          setName={setFullName}
          school={school}
          setSchool={setSchool}
          gradQuarter={gradQuarter}
          setGradQuarter={setGradQuarter}
          gradYear={gradYear}
          setGradYear={setGradYear}
          validate={icebreakerValidate}
        />
      )}
      {step === 2 && (
        <InfoDetail
          handleNextClick={handleNextClick}
          handleBackClick={handleBackClick}
          gradQuarter={gradQuarter}
          setGradQuarter={setGradQuarter}
          gradYear={gradYear}
          setGradYear={setGradYear}
          major={major}
          setMajor={setMajor}
          setMajorName={setMajorName}
          wantsDbMajor={wantsDbMajor}
          setWantsDbMajor={setWantsDbMajor}
          doubleMajor={doubleMajor}
          setDoubleMajor={setDoubleMajor}
          setDoubleMajorName={setDoubleMajorName}
          school={school}
          validate={infoDetailValidate}
          techBreadth={techBreadth}
          setTechBreadth={setTechBreadth}
          secondTechBreadth={secondTechBreadth}
          setSecondTechBreadth={setSecondTechBreadth}
        />
      )}
      {step === 3 && (
        <SchedulePreferences
          prefNoDays={prefNoDays}
          setPrefNoDays={setPrefNoDays}
          earliestClassTime={earliestClassTime}
          latestClassTime={latestClassTime}
          setEarliestClassTime={setEarliestClassTime}
          setLatestClassTime={setLatestClassTime}
          handleNextClick={handleNextClick}
          handleBackClick={handleBackClick}
          validate={scheduleValidate}
        />
      )}
      {step === 4 && (
        <PreferencesStep
          leastCoursesPerTerm={leastCoursesPerTerm}
          setLeastCoursesPerTerm={setLeastCoursesPerTerm}
          maxCoursesPerTerm={maxCoursesPerTerm}
          setMaxCoursesPerTerm={setMaxCoursesPerTerm}
          prefInstructors={prefInstructors}
          setPrefInstructors={setPrefInstructors}
          prefBuildings={prefBuildings}
          setPrefBuildings={setPrefBuildings}
          geInterests={geInterests}
          setGeInterests={setGeInterests}
          handleNextClick={handleNextClick}
          handleBackClick={handleBackClick}
        />
      )}
      {step === 5 && (
        <AdvancedPreferencesStep
          allowWarnings={allowWarnings}
          setAllowWarnings={setAllowWarnings}
          allowPrimaryConflicts={allowPrimaryConflicts}
          setAllowPrimaryConflicts={setAllowPrimaryConflicts}
          allowSecondaryConflicts={allowSecondaryConflicts}
          setAllowSecondaryConflicts={setAllowSecondaryConflicts}
          prefPriority={prefPriority}
          setPrefPriority={setPrefPriority}
          handleNextClick={handleNextClick}
          handleBackClick={handleBackClick}
        />
      )}
      {step === 6 && (
        <TranscriptStep
          transcript={transcript}
          setTranscript={setTranscript}
          handleNextClick={handleNextClick}
          handleBackClick={handleBackClick}
          majorName={majorName}
          doubleMajorName={wantsDbMajor ? doubleMajorName : null}
        />
      )}
      {step === 7 && (
        <SummaryView
          handleBackClick={handleBackClick}
          setStep={setStep}
          data={{
            fullName: fullName,
            school: school,
            gradQuarter: gradQuarter,
            gradYear: gradYear,
            major: major,
            majorName: majorName,
            doubleMajor: doubleMajor,
            doubleMajorName: doubleMajorName,
            wantsDbMajor: wantsDbMajor,
            prefNoDays: prefNoDays,
            earliestClassTime: earliestClassTime,
            latestClassTime: latestClassTime,
            transcript: transcript,
            leastCoursesPerTerm: leastCoursesPerTerm,
            maxCoursesPerTerm: maxCoursesPerTerm,
            prefInstructors: prefInstructors,
            prefBuildings: prefBuildings,
            geInterests: geInterests,
            allowWarnings: allowWarnings,
            allowPrimaryConflicts: allowPrimaryConflicts,
            allowSecondaryConflicts: allowSecondaryConflicts,
            prefPriority: prefPriority,
            techBreadth: techBreadth,
            secondTechBreadth: secondTechBreadth
          }}
        />
      )}
        </div>
      </div>
    </div>
  );
};
