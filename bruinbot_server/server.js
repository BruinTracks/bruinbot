import express from "express";
import cors from "cors";
import schoolRoutes from "./routes/school_routes.js";
import majorRoutes from "./routes/major_routes.js";
import courseRoutes from "./routes/course_routes.js";
import instructorRoutes from "./routes/instructor_routes.js";
import scheduleRoutes from "./routes/schedule_routes.js";
import { buildSchedule, getElectiveOptions } from "./services/courseOptionResolver.js";
import queryRoutes from "./routes/query_routes.js";
import { authenticateUser } from "./middleware/auth.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use("/schools", schoolRoutes);
app.use("/majors", majorRoutes);
app.use("/courses", courseRoutes);
app.use("/instructors", instructorRoutes);
app.use("/api/schedule", authenticateUser, scheduleRoutes);
app.use("/api/query", authenticateUser, queryRoutes);

app.post('/api/schedule/build', async (req, res) => {
    try {
        const result = await buildSchedule(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/schedule/elective-options', async (req, res) => {
    try {
        const result = await getElectiveOptions(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
