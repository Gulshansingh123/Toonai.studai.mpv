import { Link } from "react-router-dom";

export default function CreatePage() {
  const options = [
    { to: "/create/text-to-video", title: "Text to Animation", desc: "Describe a scene, get an animated video" },
    { to: "/create", title: "Image to Video", desc: "Bring a photo or drawing to life" },
    { to: "/create", title: "AI Story", desc: "Full story with scenes, dialogue and narration" },
    { to: "/create", title: "AI Voice", desc: "Generate narration in Hindi, English or Hinglish" },
  ];
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">Create</h1>
      {options.map((o) => (
        <Link key={o.title} to={o.to} className="block rounded-2xl bg-neutral-900 p-4">
          <p className="font-semibold">{o.title}</p>
          <p className="text-sm text-neutral-400">{o.desc}</p>
        </Link>
      ))}
    </div>
  );
}
