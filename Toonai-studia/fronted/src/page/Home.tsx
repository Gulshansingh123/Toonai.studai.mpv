import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function HomePage() {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    api
      .getBalance()
      .then((b) => setCredits(b.available))
      .catch(() => setCredits(null));
  }, []);

  const actions = [
    { to: "/create/text-to-video", label: "Create Animation", emoji: "🎬" },
    { to: "/create", label: "Image to Video", emoji: "🖼️" },
    { to: "/create", label: "AI Story", emoji: "📖" },
    { to: "/create", label: "AI Voice", emoji: "🎙️" },
  ];

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ToonAI Studio</h1>
        <div className="rounded-full bg-violet-600/20 px-3 py-1 text-sm text-violet-300">
          {credits === null ? "…" : `${credits} Credits`}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {actions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-8 text-center"
          >
            <span className="text-3xl">{a.emoji}</span>
            <span className="text-sm font-medium">{a.label}</span>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-400">Recent Projects</h2>
        <Link to="/projects" className="text-sm text-violet-400">
          View all projects →
        </Link>
      </section>
    </div>
  );
}
