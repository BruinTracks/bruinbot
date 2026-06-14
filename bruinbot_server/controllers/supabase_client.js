import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

// Load environment variables
dotenv.config({ path: envPath });

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Environment variables:", {
    SUPABASE_URL: supabaseUrl ? "exists" : "missing",
    SUPABASE_SERVICE_ROLE_KEY: supabaseKey ? "exists" : "missing",
  });
  throw new Error("Missing Supabase credentials. Please check your .env file.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
