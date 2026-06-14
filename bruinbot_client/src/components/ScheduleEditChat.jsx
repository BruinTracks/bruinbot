import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../AuthContext.jsx';
import { motion } from 'framer-motion';
import { apiUrl } from '../api';

export const ScheduleEditChat = ({ scheduleData, onScheduleUpdate }) => {
  const { session } = useAuth();
  const initialAssistantMessage =
    'I am your Schedule Editor. I can reorganize your plan, swap courses, replace filler slots, and adjust your schedule while respecting prerequisites.';
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: initialAssistantMessage
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const examplePrompts = [
    'Swap this Filler course for something related to dance.',
    'Move [Course Name] from Winter 2027 to Spring 2027.',
    'Swap this GE for something related to linguistics.',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      // Get transcript data from localStorage
      const storedData = localStorage.getItem('scheduleData');
      const parsedStored = storedData ? JSON.parse(storedData) : {};
      const transcriptData = parsedStored?.transcript || {};
      const preferenceData = parsedStored?.preferences || {};
      const school = parsedStored?.school || null;


      // Send request to backend
      const response = await fetch(apiUrl('/api/schedule/edit'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          question: userMessage,
          scheduleData: scheduleData,
          transcript: transcriptData,
          preferences: preferenceData,
          school
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      
      // Update schedule in localStorage if new schedule is returned
      if (data.schedule) {
        
       // const storedData = JSON.parse(localStorage.getItem('scheduleData'));
        
        // Clean up the schedule by handling FILLER courses
        const cleanedSchedule = {};

        Object.entries(data.schedule).forEach(([term, courses]) => {
          if (Array.isArray(courses)) {
            // For array format, filter out empty strings and undefined values
            cleanedSchedule[term] = courses.filter(course => course && course !== "");
          } else if (typeof courses === 'object') {
            // For object format, keep FILLER courses but ensure they have proper structure
            cleanedSchedule[term] = {};
            Object.entries(courses).forEach(([courseId, courseData]) => {
              if (courseId === "FILLER") {
                cleanedSchedule[term][courseId] = { lecture: null, discussion: null };
              } else {
                cleanedSchedule[term][courseId] = courseData;
              }
            });
          }
        });
        
        
        //storedData.schedule.schedule = cleanedSchedule;
        //localStorage.setItem('scheduleData', JSON.stringify(storedData));
        
        
        // Trigger a page reload to reflect the schedule changes
        //window.location.reload();
        onScheduleUpdate(cleanedSchedule);
      }

      // Add assistant response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.message
      }]);

    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (prompt) => {
    setInput(prompt);
  };

  const showSuggestions = messages.length <= 1;

  return (
    <div className="flex flex-col h-full">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-300">
                  Schedule Editor
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Make schedule changes with guardrails
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Ask for moves, swaps, section changes, GE replacements, or
                  filler-course suggestions. I will try to keep prerequisite
                  rules and schedule structure intact.
                </p>
              </div>
              <div className="hidden rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-200 md:block">
                Editing assistant
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Course moves', 'GE swaps', 'Filler replacements'].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs text-slate-200"
                >
                  {item}
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {messages.map((message, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3 ${
                message.role === 'assistant'
                  ? 'border border-slate-700 bg-slate-800 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                {message.role === 'assistant' ? 'Schedule Editor' : 'You'}
              </p>
              <p className="text-sm">{message.content}</p>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-3 text-white">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Schedule Editor
              </p>
              <p className="text-sm">Reviewing your schedule changes...</p>
            </div>
          </motion.div>
        )}
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <p className="mb-3 text-sm font-medium text-slate-300">
              Try asking me about:
            </p>
            <div className="grid grid-cols-1 gap-2">
              {examplePrompts.map((prompt, index) => (
                <motion.button
                  key={index}
                  onClick={() => handleSuggestionClick(prompt)}
                  className="rounded-xl border border-slate-700 bg-slate-800/90 p-3 text-left transition-colors hover:border-blue-400/40 hover:bg-slate-700"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <p className="text-sm text-white">{prompt}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask to move, swap, replace, or refine your schedule..."
            className="flex-1 rounded-xl bg-gray-700 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={`px-4 py-2 rounded-lg ${
              isLoading || !input.trim()
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-gray-300 border-t-white rounded-full animate-spin"></div>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}; 

ScheduleEditChat.propTypes = {
  scheduleData: PropTypes.object,
  onScheduleUpdate: PropTypes.func.isRequired,
};
