import { Routes, Route, NavLink } from "react-router-dom";
import HomePage from "./pages/Home";
import LoginPage from "./pages/Login";
import SignupPage from "./pages/Signup";
import CreatePage from "./pages/Create";
import TextToVideoPage from "./pages/TextToVideo";
import ProjectsPage from "./pages/Projects";
import ProfilePage from "./pages/Profile";

function BottomNav() {
  const tabs = [
    { to: "/", label: "Home" },
    { to: "/create", label: "Create" },
    { to: "/projects", label: "Projects" },
    { to: "/profile", label: "Profile" },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t border-neutral-800 bg-neutral-950 py-2">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `px-4 py-1 text-sm rounded-full ${isActive ? "text-violet-400 font-semibold" : "text-neutral-400"}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen pb-16">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/create/text-to-video" element={<TextToVideoPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
