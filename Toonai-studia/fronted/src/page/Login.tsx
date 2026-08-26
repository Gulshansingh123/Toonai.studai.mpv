import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setTokens } from "../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await api.login(email, password);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Login failed");
      return;
    }
    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken);
    navigate("/");
  }

  return (
    <div className="flex min-h-screen flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-bold">Log in to ToonAI Studio</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 px-4 py-3"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 px-4 py-3"
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="w-full rounded-lg bg-violet-600 py-3 font-semibold">
          Log In
        </button>
      </form>
      <p className="mt-4 text-sm text-neutral-400">
        No account? <Link to="/signup" className="text-violet-400">Sign up</Link>
      </p>
    </div>
  );
}
