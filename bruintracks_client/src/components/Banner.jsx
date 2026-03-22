import { useState, useEffect, useCallback } from 'react';
import { ArrowRightCircle } from 'react-bootstrap-icons';
import { motion } from 'framer-motion';
import headerImg from '../assets/headerImg.png';
import GoogleAuthButton from './GoogleAuthButton';

const ROTATING_PHRASES = ['8 AMs.', 'Friday classes.', 'schedule stress.'];
const TYPING_PAUSE_MS = 2000;
const PANEL_CLASS =
  'rounded-3xl border border-slate-700/80 bg-slate-900/80 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur-sm';
const FEATURED_ITEMS = [
  {
    name: 'UCLA Digital & Technology Solutions',
    label: 'UCLA Feature',
    href: 'https://dts.ucla.edu/newsroom/smarter-course-planning-with-bruinbot',
    blurb: 'Showcased BruinBot as a smarter course-planning tool built with UCLA partners.'
  },
  {
    name: 'Daily Bruin',
    label: 'Campus Press',
    href: 'https://dailybruin.com/2025/10/16/bruinbot-to-launch-accessible-ai-academic-advising-designed-by-students',
    blurb: 'Covered the student-built launch and BruinBot’s personalized advising experience.'
  }
];

export const Banner = () => {
  const [loopNum, setLoopNum] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [text, setText] = useState('');
  const [delta, setDelta] = useState(300 - Math.random() * 100);

  const tick = useCallback(() => {
    const i = loopNum % ROTATING_PHRASES.length;
    const fullText = ROTATING_PHRASES[i];
    const updatedText = isDeleting
      ? fullText.substring(0, text.length - 1)
      : fullText.substring(0, text.length + 1);

    setText(updatedText);

    if (isDeleting) {
      setDelta((prev) => prev / 2);
    }

    if (!isDeleting && updatedText === fullText) {
      setIsDeleting(true);
      setDelta(TYPING_PAUSE_MS);
    } else if (isDeleting && updatedText === '') {
      setIsDeleting(false);
      setLoopNum((prev) => prev + 1);
      setDelta(500);
    }
  }, [isDeleting, loopNum, text]);

  useEffect(() => {
    const ticker = setInterval(() => {
      tick();
    }, delta);

    return () => clearInterval(ticker);
  }, [delta, tick]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_28%),radial-gradient(circle_at_85%_15%,_rgba(59,130,246,0.14),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.10),_transparent_28%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex w-full flex-col gap-5">
          <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className={`${PANEL_CLASS} relative flex h-full min-h-[640px] flex-col overflow-hidden p-8 sm:p-10`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_36%)]" />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-5 py-2 text-sm font-medium text-cyan-100">
                  BruinBot Planner for AI-powered UCLA scheduling
                </span>
              </div>

              <h1 className="mt-10 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
                Say no to
              </h1>
              <div className="mt-0 flex min-h-[1.3em] items-end text-5xl font-bold tracking-tight text-cyan-300 sm:text-6xl lg:text-7xl">
                <span className="inline-block whitespace-nowrap">
                  {text}
                </span>
                <span className="ml-1 inline-block animate-pulse text-cyan-200">|</span>
              </div>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                A smarter UCLA course planner built around your major requirements,
                preferences, completed coursework, and next best move.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {['Personalized roadmap', 'Live planning help', 'Editable scheduling'].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-10 flex flex-col gap-5 border-t border-slate-800 pt-6 lg:flex-row lg:items-center lg:justify-between">
                <GoogleAuthButton className="inline-flex cursor-pointer items-center justify-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-[0_18px_45px_rgba(37,99,235,0.28)] transition hover:bg-blue-700 hover:shadow-[0_22px_55px_rgba(37,99,235,0.38)]">
                  <span>Get started</span>
                  <ArrowRightCircle size={26} />
                </GoogleAuthButton>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className="mr-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    As featured in
                  </span>
                  {FEATURED_ITEMS.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/35 hover:text-white"
                    >
                      {item.name === 'Daily Bruin' ? 'Daily Bruin' : 'UCLA DTS'}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
            className={`${PANEL_CLASS} relative flex h-full min-h-[640px] items-end justify-center overflow-hidden p-6 sm:p-8`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,_rgba(34,211,238,0.18),_transparent_24%),radial-gradient(circle_at_50%_58%,_rgba(59,130,246,0.10),_transparent_36%),linear-gradient(180deg,rgba(10,18,40,0.46),rgba(8,15,40,0.96))]" />
            <div className="absolute left-1/2 top-[11rem] h-[18rem] w-[18rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.16),rgba(15,23,42,0.02)_60%,transparent_74%)] blur-[10px]" />
            <div className="absolute left-1/2 top-[10.3rem] h-[19rem] w-[19rem] -translate-x-1/2 rounded-full border border-cyan-400/10" />
            <div className="absolute left-1/2 top-[11.5rem] h-[15.5rem] w-[15.5rem] -translate-x-1/2 rounded-full border border-blue-400/10" />
            <div className="relative z-10 flex h-full w-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
                    Modern course planner
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-slate-300">
                    Built for students who want clarity, flexibility, and speed.
                  </p>
                </div>
                <div className="hidden min-w-[8.75rem] items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-center text-xs font-medium text-emerald-200 sm:inline-flex">
                  Planner ready
                </div>
              </div>
              <div className="mt-12 flex w-full flex-1 flex-col items-center justify-end">
              <div className="relative w-full overflow-hidden rounded-[2rem] px-5 pb-2 pt-3">
                <div className="absolute inset-x-12 top-6 h-20 rounded-full bg-cyan-400/6 blur-3xl" />
                <div className="absolute inset-x-14 bottom-4 h-8 rounded-full bg-cyan-400/8 blur-2xl" />
                <img
                  src={headerImg}
                  alt="BruinBot planner mascot"
                  className="relative z-10 mx-auto aspect-square w-full max-w-[24rem] scale-[1.03] object-contain object-center saturate-[0.95] hue-rotate-[2deg] drop-shadow-[0_24px_60px_rgba(8,15,40,0.72)]"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {['Personalized planning', 'Less Stress', 'Built by Bruins, for Bruins'].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-200"
                  >
                    {item}
                  </span>
                ))}
              </div>
              </div>
            </div>
          </motion.div>
        </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: 0.08 }}
            className={`${PANEL_CLASS} p-5 sm:p-6`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  Recognition
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                  Featured by UCLA and the Daily Bruin
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Coverage from UCLA Digital &amp; Technology Solutions and the Daily Bruin highlights
                  BruinBot’s student-built approach to smarter academic planning.
                </p>
              </div>
              <div className="rounded-full border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-300">
                Student-built AI course planner
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {FEATURED_ITEMS.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-2xl border border-slate-700/70 bg-slate-950/55 p-4 transition hover:border-cyan-400/35 hover:bg-slate-900/90"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                      {item.label}
                    </span>
                    <span className="text-sm text-slate-400 transition group-hover:text-cyan-200">
                      Read feature
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-semibold text-white">{item.name}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.blurb}</p>
                </a>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Banner;
