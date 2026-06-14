import { OpenAI } from "openai";
import dotenv from "dotenv";
import supabase from "./supabase_client.js";
import { tools } from "../tools/gpt_tools/tools-list.js";

dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Input validation middleware
export const validateQueryInput = (req, res, next) => {
  const { question } = req.body;

  if (
    !question ||
    typeof question !== "string" ||
    question.trim().length === 0
  ) {
    return res.status(400).json({
      error:
        "Invalid input: question is required and must be a non-empty string",
    });
  }

  next();
};

export const processQuery = async (req, res) => {
  const { question, chatHistory = [], scheduleData } = req.body;
  console.log("Received query:", { question, chatHistory });

  try {
    // Use schedule data from client if available, otherwise fetch from database
    let userSchedule = scheduleData;
    if (!userSchedule && req.user && req.user.id) {
      const { data: scheduleData, error: scheduleError } = await supabase
        .from("schedules")
        .select("schedule")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!scheduleError && scheduleData && scheduleData.length > 0) {
        userSchedule = scheduleData[0].schedule;
      }
    }

    // Build messages array with chat history
    const messages = [
      {
        role: "system",
        content: `You are a helpful university assistant. You can help with:
                 - Course planning and scheduling
                 - Academic information and requirements
                 - General university questions
                 - Course recommendations
                 Use the available functions to help answer questions about courses, instructors, and schedules when relevant.
                 For general questions, provide helpful responses without using specific functions.
                 
                 ${
                   userSchedule
                     ? `The user's current schedule is: ${JSON.stringify(
                         userSchedule
                       )}`
                     : ""
                 }`,
      },
      ...chatHistory,
      { role: "user", content: question },
    ];
    console.log("Built messages array:", messages);

    // Invoke GPT with function calling
    console.log("Calling GPT with model: gpt-4o");
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
    });
    console.log("GPT response:", gptResponse);
    console.log("GPT response message:", gptResponse.choices[0].message);

    const toolCall = gptResponse.choices[0].message.tool_calls?.[0];
    if (!toolCall) {
      console.log("No tool call determined from GPT response");
      // Instead of returning an error, use the GPT response directly
      const assistantResponse = gptResponse.choices[0].message.content;
      console.log("Using direct GPT response:", assistantResponse);
      return res.json({
        answer: assistantResponse,
        chatHistory: [
          ...chatHistory,
          { role: "user", content: question },
          { role: "assistant", content: assistantResponse },
        ],
      });
    }

    const { name, arguments: args } = toolCall.function;
    const params = JSON.parse(args);
    console.log("Tool call:", { name, params });

    // Call the corresponding Supabase RPC function
    console.log("Calling Supabase RPC:", name);
    const { data, error } = await supabase.rpc(name, params);
    console.log("Supabase response:", { data, error });

    if (error) {
      console.error("Database Error:", error);
      return res.status(500).json({
        error: "Failed to retrieve the requested information.",
        details: error.message,
      });
    }

    // If no data was found
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.log("No data found for query");
      return res.json({
        function_called: name,
        parameters: params,
        result: [],
        answer: `No information found matching your criteria. Please try adjusting your search parameters.`,
        chatHistory: [...chatHistory, { role: "user", content: question }],
      });
    }

    // Summarize the result using GPT
    console.log("Summarizing results with GPT");
    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `The user may ask for lists of courses or academic data. You will be given a **subset of relevant information**, already filtered or limited from a larger database.

          Your job is to summarize this data in a helpful and concise way. Include specific examples if possible, such as course names, codes, instructors, prerequisites, or times.
          
          If the data appears incomplete or limited, let the user know it is a **sample** or **partial listing**, and invite them to narrow their query (e.g., by department, keyword, or quarter).
          
          Always keep your response under 3 sentences, and consider the chat history context. If you are providing filler courses ensure that they have NO enforced requisites or requisites in the description of that course. Don't mention courses that don't fit this requirement. Only list those that do`,
        },
        ...chatHistory,
        {
          role: "user",
          content: `Question: ${question}\n\nData: ${JSON.stringify(data)}`,
        },
      ],
    });
    console.log("Summary response:", summaryResponse);

    const assistantResponse = summaryResponse.choices[0].message.content.trim();

    res.json({
      function_called: name,
      parameters: params,
      result: data,
      answer: assistantResponse,
      chatHistory: [
        ...chatHistory,
        { role: "user", content: question },
        { role: "assistant", content: assistantResponse },
      ],
    });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({
      error: "An unexpected error occurred while processing your request.",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
