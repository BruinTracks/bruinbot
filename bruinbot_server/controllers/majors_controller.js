import supabase from "./supabase_client.js";

const getMajorsWithRequirements = async () => {
  const { data, error } = await supabase
    .from("major_requisites")
    .select("major_name");

  if (error) throw error;
  return new Set((data || []).map((row) => row.major_name));
};

export const getMajorsBySchool = async (req, res) => {
  try {
    const { school_id } = req.query;
    if (!school_id) {
      return res.status(400).json({ message: "Missing school_id" });
    }
    const { data, error } = await supabase
      .from("majors")
      .select("full_name, major_name")
      .eq("school", school_id);
    if (error) throw error;

    const majorsWithReqs = await getMajorsWithRequirements();
    const filtered = (data || []).filter((row) =>
      majorsWithReqs.has(row.major_name),
    );
    res.status(200).json(filtered.map((row) => row.full_name));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getAllMajors = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("majors")
      .select("full_name, major_name");
    if (error) throw error;

    const majorsWithReqs = await getMajorsWithRequirements();
    const filtered = (data || []).filter((row) =>
      majorsWithReqs.has(row.major_name),
    );
    res.status(200).json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
