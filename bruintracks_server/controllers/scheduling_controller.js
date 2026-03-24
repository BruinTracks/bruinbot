// controllers/scheduling_controller.js
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import supabase from "./supabase_client.js";

// ESM __dirname shim
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * POST /schedule
 * Spawns the Python scheduler, pipes in req.body, and returns its JSON output.
 */
export const scheduleCourses = (req, res) => {
  // adjust the path if your get_courses.py lives elsewhere
  const scriptPath = path.join(__dirname, "..", "scheduler.py");
  const pythonBin = process.env.PYTHON_BIN || "python3";

  console.log(`Using Python interpreter: ${pythonBin}`);

  const py = spawn(pythonBin, [scriptPath], {
    stdio: ["pipe", "pipe", "inherit"],
  });

  let stdout = "";
  py.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  py.on("close", (code) => {
    if (code !== 0) {
      return res
        .status(500)
        .json({ error: `Scheduler script exited with code ${code}` });
    }
    try {
      const result = JSON.parse(stdout);

      // Save schedule to database
      if (req.user && req.user.id && result) {
        supabase
          .from("schedules")
          .insert([
            {
              user_id: req.user.id,
              schedule: result, // Assuming the whole result is the schedule object
            },
          ])
          .then(({ data, error }) => {
            if (error) {
              console.error("Error saving schedule to database:", error);
            } else {
              console.log("Schedule successfully saved to database:", data);
            }
          })
          .catch((error) => {
            console.error("Promise rejection error saving schedule:", error);
          });
      } else if (!req.user || !req.user.id) {
        console.warn("User not authenticated. Schedule not saved to database.");
      } else if (!result) {
        console.warn(
          "No scheduling result received. Schedule not saved to database."
        );
      }

      res.json(result);
    } catch (err) {
      console.error("Failed to parse scheduler JSON:", err);
      res.status(500).json({ error: "Invalid JSON from scheduler script" });
    }
  });

  py.stdin.write(JSON.stringify(req.body));
  py.stdin.end();
};

/**
 * GET /schedule/latest
 * Fetches the latest schedule for the authenticated user from the database.
 */
export const getLatestSchedule = async (req, res) => {
  console.log("Attempting to fetch latest schedule...");
  if (!req.user || !req.user.id) {
    console.warn("User not authenticated. Cannot fetch schedule.");
    return res.status(401).json({ error: "User not authenticated" });
  }

  try {
    console.log(`Fetching schedule for user ID: ${req.user.id}`);
    const { data, error } = await supabase
      .from("schedules")
      .select("schedule")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error fetching schedule:", error);
      return res.status(500).json({ error: "Error fetching schedule" });
    }

    if (data && data.length > 0) {
      console.log("Successfully fetched latest schedule:", data[0].schedule);
      res.json(data[0].schedule);
    } else {
      console.log("No schedule found for user.");
      res.status(404).json({ error: "No schedule found" });
    }
  } catch (error) {
    console.error("Unexpected error fetching schedule:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
