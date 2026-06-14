import { motion } from 'framer-motion';
import { ArrowRightCircle } from 'react-bootstrap-icons';

const schedules = {
  'S25': ['CS 33', 'MATH 61', 'CS 35L'],
  'F25': ['CS 111', 'CS 180', 'CS M51A'],
  'W25': ['CS 181', 'CS 118', 'CS M151B', 'CS M152A']
};
export const FullCoursePlan = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.75 }}
      whileHover={{ opacity: 1, y: -20 }}
      className="flex-1 mt-5 mb-5 bg-gray-500 rounded-2xl p-3 h-full mr-2 justify-center"
    >
      <div className=" flex flex-col items-center justify-center">
        <motion.h2
          className="text-3xl font-bold mt-6 mb-6 p-6"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Four-Year Plan
        </motion.h2>
        <div className="flex flex-row items-center justify-center">
            {Object.keys(schedules).map((scheduleKey, index) => (
              <motion.div
                key={index}
                className="bg-gray-700 mr-4 rounded-2xl shadow-md p-5 h-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.75, y: 0 }}
                whileHover={{ opacity: 1, y: 50 }}
                transition={{ delay: index * 0.1 }}
              >
                <h2 className="text-xl font-bold text-blue-400">{scheduleKey}</h2>
                {schedules[scheduleKey].map((item, i) => (
                  <div key={i} className="mt-2">
                    <p className="text-gray-400">{item}</p>
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        <button
          className="text-white mt-1 hover:text-blue-500 flex flex-col justify-center items-center text-center"
        >
          <a className="!text-white visited:text-white" href="/CoursePlanDetail">See full plan</a>
          <ArrowRightCircle size={30} />
        </button>
      </div>
    </motion.div>
  );
};
