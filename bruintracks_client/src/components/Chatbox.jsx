import { Button } from './Button';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext';

export const Chatbox = () => {
  const { session } = useAuth();
  const initialAssistantMessage =
    'I am your AI Planning Assistant. I can help with UCLA requirements, course options, quarter planning, and questions about your current schedule.';
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('chatHistory');
    return savedMessages ? JSON.parse(savedMessages) : [
      { role: 'assistant', content: initialAssistantMessage }
    ];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const exampleQuestions = [
    'What courses does professor Smallberg teach?',
    'What are some easy intro math classes I can take?',
    'What are some courses related to robotics?',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('chatHistory', JSON.stringify(messages));
  }, [messages]);

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: initialAssistantMessage }]);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    const updatedMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      if (!session?.access_token) {
        throw new Error('No authentication token found. Please sign in again.');
      }

      // Get schedule data from localStorage
      const storedSchedule = localStorage.getItem('scheduleData');
      const scheduleData = storedSchedule ? JSON.parse(storedSchedule).schedule.schedule : null;

      const response = await fetch('http://localhost:3000/api/query', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          question: userMessage,
          chatHistory: updatedMessages,
          scheduleData: scheduleData
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Invalid JSON from server');
      }

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        // If the response includes a new schedule, update localStorage
        if (data.schedule) {
          const storedData = JSON.parse(localStorage.getItem('scheduleData'));
          storedData.schedule.schedule = data.schedule;
          localStorage.setItem('scheduleData', JSON.stringify(storedData));
          // Trigger a page reload to reflect the schedule changes
          window.location.reload();
        }
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: err.message === 'No authentication token found. Please sign in again.' 
          ? err.message 
          : 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion);
  };

  const showSuggestions = messages.length <= 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 shadow-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  AI Planning Assistant
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  Plan smarter across requirements, courses, and next steps
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Ask about degree requirements, course sequencing, GE options,
                  prerequisites, or what to take next based on your current
                  schedule.
                </p>
              </div>
              <div className="hidden rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200 md:block">
                Live assistant
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Degree planning', 'GE guidance', 'Prerequisite help'].map((item) => (
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

        {messages.map((message, ind) => (
          <motion.div
            key={ind}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-2xl p-3 ${message.role === 'assistant' ? 'border border-slate-700 bg-slate-800 text-white' : 'bg-blue-600 text-white'}`}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                {message.role === 'assistant' ? 'Planning Assistant' : 'You'}
              </p>
              <p className="text-sm">{message.content}</p>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-3 text-white">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                Planning Assistant
              </p>
              <p className="text-sm">Thinking through your options...</p>
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
              {exampleQuestions.map((question, index) => (
                <motion.button
                  key={index}
                  onClick={() => handleSuggestionClick(question)}
                  className="rounded-xl border border-slate-700 bg-slate-800/90 p-3 text-left transition-colors hover:border-cyan-400/40 hover:bg-slate-700"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <p className="text-sm text-white">{question}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-4 bg-gray-800">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            className="flex-1 rounded-xl border border-gray-600 bg-gray-700 p-3 text-white placeholder-gray-400 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            placeholder="Ask about classes, requirements, or what to take next..."
          />
          <Button 
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
            className={`${
              isLoading || !inputValue.trim()
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white px-4 py-2 rounded-lg transition-colors`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
          <Button
            onClick={clearChat}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
            title="Clear chat history"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
