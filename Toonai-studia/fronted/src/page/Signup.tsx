import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await api.signup(email, password);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error?.formErrors?.join(", ") ?? data.error ?? "Signup failed");
      return;
    }
    setMessage("Account created. Please check your email to verify and claim your 10 free credits.");
    setTimeout(() => navigate("/login"), 2000);
  }

  return (
    <div className="flex min-h-screen flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
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
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 px-4 py-3"
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-green-400">{message}</p>}
        <button type="submit" className="w-full rounded-lg bg-violet-600 py-3 font-semibold">
          Sign Up — Get 10 Free Credits
        </button>
      </form>
      <p className="mt-4 text-sm text-neutral-400">
        Already have an account? <Link to="/login" className="text-violet-400">Log in</Link>
      </p>
    </div>
  );
}
