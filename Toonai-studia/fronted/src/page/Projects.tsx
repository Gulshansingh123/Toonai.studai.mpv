import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Project {
  id: string;
  title: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  durationSec: number;
  createdAt: string;
  thumbnailUrl?: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    async function load() {
      const data = await api.getProjects();
      setProjects(Array.isArray(data) ? data : []);
    }
    load();
    interval = setInterval(load, 5000); // poll while jobs are in flight
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">Projects</h1>
      {projects.length === 0 && <p className="text-sm text-neutral-500">No projects yet — go create one!</p>}
      {projects.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-2xl bg-neutral-900 p-3">
          <div>
            <p className="font-medium">{p.title}</p>
            <p className="text-xs text-neutral-500">
              {p.durationSec}s · {new Date(p.createdAt).toLocaleDateString()}
            </p>
          </div>
          <StatusBadge status={p.status} />
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: Project["status"] }) {
  const styles: Record<Project["status"], string> = {
    QUEUED: "bg-neutral-700 text-neutral-300",
    RUNNING: "bg-amber-600/30 text-amber-300",
    COMPLETED: "bg-green-600/30 text-green-300",
    FAILED: "bg-red-600/30 text-red-300",
  };
  return <span className={`rounded-full px-2 py-1 text-xs ${styles[status]}`}>{status}</span>;
}
