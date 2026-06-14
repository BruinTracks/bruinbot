const coursePlan = [
    {
      quarter: "Fall 2025",
      courses: ["Math 31A", "CS 31", "GE: Writing I"]
    },
    {
      quarter: "Winter 2026",
      courses: ["Math 31B", "CS 32", "GE: Life Science"]
    },
    {
      quarter: "Spring 2026",
      courses: ["Math 32A", "CS 33", "GE: Social Science"]
    },
    // Add more quarters as needed...
  ];
  
 const courseExplanations = [
    "Foundation in calculus and CS. Writing course to fulfill GE.",
    "Continue calculus, deepen CS knowledge, GE to balance schedule.",
    "Start multivariable calc, systems programming, and breadth."
    // Add more explanations as needed...
];

import { useState } from 'react';

export default function CoursePlanDetailPage() {
  const [explanations, setExplanations] = useState({});

  const handleRequestExplanation = (index) => {
    setExplanations((prev) => ({ ...prev, [index]: courseExplanations[index] }));
  };

  return (
    <div className="min-h-screen min-w-screen bg-gray-900 text-gray-100 p-8">
      <div className="flex items-center mb-8">
        <a
          href="/Home"
          className="text-blue-400 hover:text-blue-300 font-medium text-sm mr-4 underline"
        >
          ← Back
        </a>
        <h1 className="text-3xl font-bold">UCLA Course Plan</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {coursePlan.map((quarter, index) => (
          <div
            key={index}
            className="bg-gray-800 text-gray-100 rounded-2xl shadow-md p-6 border border-gray-700"
          >
            <h2 className="text-xl font-semibold mb-2">{quarter.quarter}</h2>
            <ul className="list-disc list-inside mb-4 text-gray-300">
              {quarter.courses.map((course, i) => (
                <li key={i}>{course}</li>
              ))}
            </ul>
            <button
              onClick={() => handleRequestExplanation(index)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-xl"
            >
              Request Explanation from ChatGPT
            </button>
            {explanations[index] && (
              <p className="mt-4 text-sm text-gray-400 border-t border-gray-600 pt-3">
                {explanations[index]}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
