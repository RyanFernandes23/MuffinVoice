import React, { useState, useRef, useEffect } from "react";

// App.jsx - drop into a Vite + React project at src/App.jsx
// Usage notes (short):
// - Set VITE_API_BASE in .env (ex: VITE_API_BASE=http://localhost:8000)
// - Ensure your backend expects X-User-ID header. Enter any user id in the UI.

export default function App() {
  const [file, setFile] = useState(null);
  const [voice, setVoice] = useState("af_bella");
  const [userId, setUserId] = useState("user-123");
  const [status, setStatus] = useState("idle");
  const [jobId, setJobId] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const audioRef = useRef(null);
  const pollRef = useRef(null);

  const API_BASE = "http://localhost:8000";

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function upload() {
    if (!file) return setError("Please pick a file first.");
    setError(null);
    setStatus("uploading");

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch(`${API_BASE}/upload_file?voice=${encodeURIComponent(
        voice
      )}`, {
        method: "POST",
        body: form,
        headers: {
          "X-User-ID": userId,
        },
      });

      if (res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Upload failed (${res.status})`);
      }

      const body = await res.json();
      setJobId(body.job_id);
      setStatus("processing");

      // start polling
      pollRef.current = setInterval(() => checkStatus(body.job_id), 2000);
    } catch (err) {
      setError(err.message || String(err));
      setStatus("idle");
    }
  }

  async function checkStatus(job) {
    try {
      const res = await fetch(`${API_BASE}/job/${job}/status/${voice}`, {
        headers: { "X-User-ID": userId },
      });
      if (!res.ok) {
        throw new Error(`Status check failed: ${res.status}`);
      }
      const j = await res.json();
      if (j.status === "complete") {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setStatus("complete");
        await fetchManifest(job);
      } else {
        // still processing; keep polling
      }
    } catch (err) {
      // stop polling on error and surface
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setError(err.message || String(err));
      setStatus("idle");
    }
  }

  async function fetchManifest(job) {
    try {
      setStatus("fetching_manifest");
      const res = await fetch(`${API_BASE}/manifest/${job}/${voice}`, {
        headers: { "X-User-ID": userId },
      });
      if (!res.ok) {
        if (res.status === 202) {
          // backend triggered processing for new voice
          setStatus("processing_for_voice");
          return;
        }
        throw new Error(`Manifest fetch failed: ${res.status}`);
      }
      const m = await res.json();
      // Expecting { chunks: [{ index, url, text, duration? }, ...] }
      if (!m.chunks || !Array.isArray(m.chunks)) {
        throw new Error("Invalid manifest format.");
      }
      setManifest(m);
      setCurrentIndex(0);
      setStatus("ready");
    } catch (err) {
      setError(err.message || String(err));
      setStatus("idle");
    }
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  function playIndex(i) {
    if (!manifest) return;
    const chunk = manifest.chunks[i];
    if (!chunk || !chunk.url) return setError("Invalid audio chunk.");
    setCurrentIndex(i);
    if (audioRef.current) {
      audioRef.current.src = chunk.url;
      audioRef.current.play().catch((e) => setError(e.message));
    }
  }

  function handleEnded() {
    if (!manifest) return;
    const next = currentIndex + 1;
    if (next < manifest.chunks.length) {
      playIndex(next);
    }
  }

  function handlePlayPause() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play().catch((e) => setError(e.message));
    else audioRef.current.pause();
  }

  function handleNext() {
    if (!manifest) return;
    const next = Math.min(manifest.chunks.length - 1, currentIndex + 1);
    playIndex(next);
  }
  function handlePrev() {
    const prev = Math.max(0, currentIndex - 1);
    playIndex(prev);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-6">
      <div className="max-w-3xl mx-auto bg-white shadow-lg rounded-2xl p-6">
        <h1 className="text-2xl font-semibold mb-2">TTS Uploader — React + Vite</h1>
        <p className="text-sm text-slate-600 mb-4">Upload a document, pick a voice, and play the generated audio. Old-school fundamentals, modern vibes. 🎧</p>

        <div className="grid gap-3 md:grid-cols-2 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">User ID (X-User-ID)</label>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Voice</label>
            <select value={voice} onChange={(e) => setVoice(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2">
              <option value="af_bella">af_bella</option>
              <option value="en_male">en_male</option>
              <option value="en_female">en_female</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-slate-700">File</label>
          <div className="mt-1 flex items-center gap-3">
            <input type="file" accept=".txt,.pdf,.docx,.md" onChange={handleFileChange} />
            <button onClick={upload} className="rounded-md px-4 py-2 bg-slate-800 text-white">Upload</button>
            <div className="text-sm text-slate-500">{file ? file.name : "No file selected"}</div>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">Status: <strong>{status}</strong></div>
            <div className="text-sm text-rose-600">{error}</div>
          </div>
        </div>

        {manifest && (
          <div className="mt-6">
            <h2 className="text-lg font-medium mb-2">Player</h2>
            <div className="flex items-center gap-3 mb-3">
              <button onClick={handlePrev} className="px-3 py-2 rounded border">Prev</button>
              <button onClick={handlePlayPause} className="px-3 py-2 rounded border">Play/Pause</button>
              <button onClick={handleNext} className="px-3 py-2 rounded border">Next</button>
              <div className="ml-auto text-sm text-slate-500">Chunk {currentIndex + 1} of {manifest.chunks.length}</div>
            </div>

            <audio ref={audioRef} onEnded={handleEnded} controls className="w-full" />

            <div className="mt-4 grid gap-2 max-h-64 overflow-auto">
              {manifest.chunks.map((c, i) => (
                <div key={i} className={`p-3 rounded border ${i === currentIndex ? "bg-slate-100" : "bg-white"}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">Chunk {i + 1} — {c.index ?? i}</div>
                      <div className="text-xs text-slate-600 mt-1 line-clamp-3">{c.text ?? "(no text)"}</div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => playIndex(i)} className="px-2 py-1 rounded border text-sm">Play</button>
                      <a href={c.url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded border text-sm">Open</a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 text-sm text-slate-500">
          Tip: If playback doesn't start, check browser autoplay settings and make sure the presigned URLs are fresh (they expire server-side). Classic stuff. ⚙️
        </div>
      </div>
    </div>
  );
}
