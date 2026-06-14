import supabase from "./supabase_client.js";

export const searchInstructors = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) {
      return res.status(200).json([]);
    }
    const { data, error } = await supabase
      .from("instructors")
      .select("name")
      .ilike("name", `%${q}%`)
      .limit(10);

    if (error) throw error;
    res.status(200).json(data.map((row) => row.name));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
