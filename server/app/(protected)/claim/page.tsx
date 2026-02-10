"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { route } from "@/lib/routes";

export default function ClaimPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [deviceId, setDeviceId] = useState(searchParams.get("id") ?? "");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [name, setName] = useState("my-frame");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(route("/api/claim"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: deviceId.trim(),
          code: code.trim(),
          name: name.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      router.push(route("/frame/:name", { name: data.name }));
    } catch {
      setError("Failed to claim frame. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    fontFamily: "monospace",
    fontSize: "1.5rem",
    textTransform: "uppercase" as const,
    letterSpacing: "0.15em",
    textAlign: "center" as const,
    width: "100%",
    padding: "0.5rem",
    border: "2px solid #333",
    boxSizing: "border-box" as const,
  };

  return (
    <main
      style={{
        fontFamily: "monospace",
        maxWidth: "400px",
        margin: "4rem auto",
        padding: "1rem",
      }}
    >
      <h1>Claim your frame</h1>

      {error && (
        <div
          style={{
            background: "#fee",
            border: "1px solid #c00",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="deviceId"
            style={{ display: "block", marginBottom: "0.5rem" }}
          >
            Device ID
          </label>
          <input
            type="text"
            id="deviceId"
            name="deviceId"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder="XXXXX"
            required
            style={inputStyle}
            maxLength={5}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="code"
            style={{ display: "block", marginBottom: "0.5rem" }}
          >
            Code
          </label>
          <input
            type="text"
            id="code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXXX"
            required
            style={inputStyle}
            maxLength={5}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="name"
            style={{ display: "block", marginBottom: "0.5rem" }}
          >
            Frame name
          </label>
          <input
            type="text"
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-frame"
            required
            style={{
              fontFamily: "monospace",
              fontSize: "1rem",
              width: "100%",
              padding: "0.5rem",
              border: "2px solid #333",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            fontFamily: "monospace",
            fontSize: "1rem",
            width: "100%",
            padding: "0.75rem",
            background: loading ? "#666" : "#333",
            color: "#fff",
            border: "none",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Claiming..." : "Claim frame"}
        </button>
      </form>

      <a
        href={route("/")}
        style={{
          display: "block",
          textAlign: "center",
          marginTop: "1.5rem",
          color: "#666",
        }}
      >
        Back to home
      </a>
    </main>
  );
}
