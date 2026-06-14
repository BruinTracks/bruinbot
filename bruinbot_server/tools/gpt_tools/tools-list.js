export const tools = [
  {
    type: "function",
    function: {
      name: "get_courses_by_foundation",
      description: "Retrieve courses that satisfy a specific general education foundation.",
      parameters: {
        type: "object",
        properties: {
          foundation_text: {
            type: "string",
            description: "The foundation name (e.g., 'Scientific Inquiry')",
          },
        },
        required: ["foundation_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_courses_by_subject",
      description: "List all courses offered by a specific subject code.",
      parameters: {
        type: "object",
        properties: {
          subject_code: {
            type: "string",
            description: "The subject code (e.g., 'MATH')",
          },
        },
        required: ["subject_code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_courses",
      description: "Search for courses matching a free-text term in titles and descriptions, returning them ordered by relevance.",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description: "The search term to query courses by (e.g., 'robots')",
          },
        },
        required: ["search_term"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_courses_by_instructor",
      description: "List all courses taught by a specific instructor.",
      parameters: {
        type: "object",
        properties: {
          instructor_name: {
            type: "string",
            description: "The full name of the instructor (e.g., 'Smallberg')",
          },
        },
        required: ["instructor_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_courses_by_interest_no_prereqs",
      description: "Retrieve courses matching a given interest area with no prerequites. this should be called when the user asks for a filler course in a certain subject area and should exclude any courses the user already has in their schedule.",
      parameters: {
        type: "object",
        properties: {
          interest_area: {
            type: "string",
            description: "The interest area to search for (e.g., 'robots')",
          },
        },
        required: ["interest_area"],
      },
    },
  },
];