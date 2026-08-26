import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearTokens } from "../lib/api";

export default function ProfilePage() {
  const [credits, setCredits] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getBalance().then((b) => setCredits(b.available)).catch(() => {});
  }, []);

  function handleLogout() {
    clearTokens();
    navigate("/login");
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Profile</h1>
      <div className="rounded-2xl bg-neutral-900 p-4">
        <p className="text-sm text-neutral-400">Credit balance</p>
        <p className="text-2xl font-bold">{credits ?? "…"}</p>
      </div>
      <div className="space-y-2">
        {["Buy Credits", "Payment History", "Settings", "Help", "Privacy Policy", "Terms", "Delete Account"].map(
          (item) => (
            <button key={item} className="w-full rounded-lg bg-neutral-900 py-3 text-left px-4 text-sm">
              {item}
            </button>
          )
        )}
      </div>
      <button onClick={handleLogout} className="w-full rounded-lg bg-red-600/20 py-3 text-red-300">
        Log Out
      </button>
    </div>
  );
}
