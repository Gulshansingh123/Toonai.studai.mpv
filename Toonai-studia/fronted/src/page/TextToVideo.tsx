import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const DURATIONS = [5, 10, 15, 30];
const ASPECTS = ["9:16", "16:9", "1:1"];
const STYLES = [
  "2D Cartoon", "3D Cartoon", "Anime-inspired", "Kids", "Cinematic",
  "Fantasy", "Comic", "Storybook", "Cute", "Clay/Stop Motion",
];
const CAMERAS = ["Static", "Zoom", "Pan", "Tracking", "Cinematic"];

export default function TextToVideoPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState("9:16");
  const [style, setStyle] = useState(STYLES[0]);
  const [camera, setCamera] = useState("Static");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleGenerate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.createTextToVideo({
        prompt,
        durationSec: duration,
        aspectRatio: aspect,
        style,
        camera: camera.toLowerCase(),
        quality: "standard",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      navigate(`/projects`, { state: { newJobId: data.jobId } });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold">Text to Animation</h1>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Ek superhero aasman mein ud raha hai aur futuristic city ko save kar raha hai."
        className="h-28 w-full rounded-lg bg-neutral-900 p-3 text-sm"
      />

      <Section title="Duration">
        {DURATIONS.map((d) => (
          <Chip key={d} active={duration === d} onClick={() => setDuration(d)}>
            {d}s
          </Chip>
        ))}
      </Section>

      <Section title="Aspect Ratio">
        {ASPECTS.map((a) => (
          <Chip key={a} active={aspect === a} onClick={() => setAspect(a)}>
            {a}
          </Chip>
        ))}
      </Section>

      <Section title="Style">
        {STYLES.map((s) => (
          <Chip key={s} active={style === s} onClick={() => setStyle(s)}>
            {s}
          </Chip>
        ))}
      </Section>

      <Section title="Camera">
        {CAMERAS.map((c) => (
          <Chip key={c} active={camera === c} onClick={() => setCamera(c)}>
            {c}
          </Chip>
        ))}
      </Section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        disabled={submitting || prompt.trim().length < 3}
        onClick={handleGenerate}
        className="w-full rounded-lg bg-violet-600 py-3 font-semibold disabled:opacity-50"
      >
        {submitting ? "Starting generation…" : "Generate"}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase text-neutral-500">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-violet-600 text-white" : "bg-neutral-900 text-neutral-300"}`}
    >
      {children}
    </button>
  );
}
