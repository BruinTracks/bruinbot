import { Button } from './Button';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../AuthContext';

export const Chatbox = () => {
  const { session } = useAuth();
  const [messages, setMessages] = useState(() => {
    const savedMessages = localStorage.getItem('chatHistory');
    return savedMessages ? JSON.parse(savedMessages) : [
      { role: 'assistant', content: 'Hi! How may I help you?' }
    ];
  });
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const exampleQuestions = [
    "What are some math courses offered at UCLA?",
    "What GE courses satisfy the Scientific Inquiry requirement?",
    "Can you help me plan my Computer Science major?",
    "What are the prerequisites for CS 31?",
    "Which professors teach Data Structures?",
    "What courses should I take for my first quarter?",
    "Can you explain the Writing II requirement?",
    "What are some easy GE courses?"
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
    setMessages([{ role: 'assistant', content: 'Hi! How may I help you?' }]);
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
        {messages.map((message, ind) => (
          <motion.div
            key={ind}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] rounded-lg p-3 ${message.role === 'assistant' ? 'bg-gray-700 text-white' : 'bg-blue-600 text-white'}`}>
              <p className="text-sm font-medium mb-1">{message.role === 'assistant' ? 'Assistant' : 'You'}</p>
              <p className="text-sm">{message.content}</p>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="bg-gray-700 text-white rounded-lg p-3">
              <p className="text-sm font-medium mb-1">Assistant</p>
              <p className="text-sm">Thinking...</p>
            </div>
          </motion.div>
        )}
        {showSuggestions && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4"
          >
            <p className="text-sm text-gray-400 mb-3">Try asking me about:</p>
            <div className="grid grid-cols-1 gap-2">
              {exampleQuestions.map((question, index) => (
                <motion.button
                  key={index}
                  onClick={() => handleSuggestionClick(question)}
                  className="text-left p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
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
            className="flex-1 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent p-2"
            placeholder="Type your message..."
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