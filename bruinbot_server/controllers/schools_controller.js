import supabase from "./supabase_client.js";

export const getAllSchools = async (req, res) => {
  try {
    const { data, error } = await supabase.from("schools").select("name");
    if (error) throw error;
    res.status(200).json(data.map((row) => row.name));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
