import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from '../AuthContext.jsx';
import { motion } from 'framer-motion';

export const ScheduleEditChat = ({ scheduleData, onScheduleUpdate }) => {
  const { session } = useAuth();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! I can help you modify your schedule. What would you like to change?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

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
      const transcriptData = storedData ? JSON.parse(storedData).transcript : {};


      // Send request to backend
      const response = await fetch('http://localhost:3000/api/schedule/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          question: userMessage,
          scheduleData: scheduleData,
          transcript: transcriptData
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

  return (
    <div className="flex flex-col h-full">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.role === 'assistant'
                  ? 'bg-gray-700 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {message.content}
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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