import './App.css';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { Banner } from './components/Banner';
import { Form } from './components/Form';
import { HomePage } from './components/HomePage';
import { SavedSchedules } from './components/SavedSchedules';
import CoursePlanDetailPage from "./components/CoursePlanDetailPage";
import { GoogleAuthRouter } from './GoogleAuthRouter';

function App() {

  return (
    <Router>
      <GoogleAuthRouter />
      <Routes>
        <Route path="/" element={<Banner />} />
        <Route path="/Form" element={<Form />} />
        <Route path="/Home" element={<HomePage />} />
        <Route path="/schedule" element={<HomePage />} />
        <Route path="/saved-schedules" element={<SavedSchedules />} />
        <Route path="/CoursePlanDetail" element={<CoursePlanDetailPage />} />
      </Routes>
    </Router>
  );
}

/*function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  )
}*/

export default App;
