import React, { useState, useEffect, useRef } from 'react';
import '../index.css';
import '../main.jsx';
import { motion } from 'framer-motion';
import '../App.css';

export const Dropdown = ({
  options,
  onSelect,
  defaultOption,
  placeholder = null,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const [selectedOption, setSelectedOption] = useState(
    options.includes(defaultOption) ? defaultOption : ''
  );

  const toggleDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
    setActiveIndex(0);
  };

  const selectOption = (option) => {
    setIsDropdownOpen(false);
    onSelect(option);
    setSelectedOption(option);
    setActiveIndex(-1);
  };

  useEffect(() => {
    if (options.includes(defaultOption)) {
      setSelectedOption(defaultOption);
    }
  }, [defaultOption, options]);

  useEffect(() => {
    if (!isDropdownOpen) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(options.length ? 0 : -1);
  }, [isDropdownOpen, options]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const onInputKeyDown = (event) => {
    if (!options.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((prev) => (prev + 1) % options.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setActiveIndex(options.length - 1);
        return;
      }
      setActiveIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
        setActiveIndex(0);
        return;
      }
      if (activeIndex >= 0 && activeIndex < options.length) {
        selectOption(options[activeIndex]);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsDropdownOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        ref={inputRef}
        id="dropdown"
        className="h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 text-center placeholder:text-center shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        placeholder={placeholder ? placeholder : 'Select an option'}
        value={selectedOption}
        onClick={toggleDropdown}
        onKeyDown={onInputKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isDropdownOpen}
        readOnly
      />
      {isDropdownOpen && (
        <motion.div
          ref={dropdownRef}
          id="dropdown-options"
          className="absolute left-0 top-[calc(100%+0.25rem)] z-50 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0 }}
          role="listbox"
        >
          {options.map((option, index) => (
            <div
              key={`${option}-${index}`}
              className={`cursor-pointer px-3 py-2 text-sm text-gray-900 text-center ${
                index === activeIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
              onClick={() => selectOption(option)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              aria-selected={index === activeIndex}
            >
              {option}
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
};
