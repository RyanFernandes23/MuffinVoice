import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { UploadCloud, Globe, Type, Loader2, X, Mic, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function AdminUpload({ onComplete, onClose }) {
    const { getToken } = useAuth();
    const [activeTab, setActiveTab] = useState('text');
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);

    // Form states
    const [text, setText] = useState('');
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [file, setFile] = useState(null);
    const [selectedVoice, setSelectedVoice] = useState('af_bella');

    const voices = [
        { id: 'af_bella', name: 'Bella (Female)' },
        { id: 'af_sarah', name: 'Sarah (Female)' },
        { id: 'am_michael', name: 'Michael (Male)' },
        { id: 'bm_fable', name: 'Fable (Male)' },
        { id: 'bf_emma', name: 'Emma (Female)' },
        { id: 'em_alex', name: 'Alex (Male)' },
    ];

    const handleUpload = async () => {
        setIsUploading(true);
        setError(null);
        try {
            const token = await getToken();
            let response;

            if (activeTab === 'text') {
                response = await fetch(`${API_BASE_URL}/api/upload_text`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'voice': selectedVoice,
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ text, title: title || "Admin Upload" }),
                });
            } else if (activeTab === 'url') {
                response = await fetch(`${API_BASE_URL}/api/upload_webpage`, {
                    method: 'POST',
                    headers: {
                        'url': url,
                        'voice': selectedVoice,
                        Authorization: `Bearer ${token}`
                    },
                });
            } else if (activeTab === 'file') {
                const formData = new FormData();
                formData.append('file', file);
                response = await fetch(`${API_BASE_URL}/api/upload_file`, {
                    method: 'POST',
                    headers: {
                        'voice': selectedVoice,
                        Authorization: `Bearer ${token}`
                    },
                    body: formData,
                });
            }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Upload failed");
            }

            const result = await response.json();

            // Auto-toggle to public since it's an admin upload
            await fetch(`${API_BASE_URL}/api/admin/notebooks/${result.job_id}/toggle_public`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });

            onComplete();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="bg-neutral-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl w-full max-w-xl">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-xl font-bold">Create Free Audiobook</h3>
                <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="p-6">
                <div className="flex bg-black/40 p-1 rounded-xl mb-6">
                    <button
                        onClick={() => setActiveTab('text')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'text' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}
                    >
                        <Type size={16} /> Text
                    </button>
                    <button
                        onClick={() => setActiveTab('url')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'url' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}
                    >
                        <Globe size={16} /> URL
                    </button>
                    <button
                        onClick={() => setActiveTab('file')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'file' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}
                    >
                        <UploadCloud size={16} /> File
                    </button>
                </div>

                <div className="space-y-4 min-h-[200px]">
                    {activeTab === 'text' && (
                        <div className="space-y-3">
                            <input
                                type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                                placeholder="Book Title"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <textarea
                                value={text} onChange={(e) => setText(e.target.value)}
                                placeholder="Paste content here..."
                                rows={6}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                            />
                        </div>
                    )}

                    {activeTab === 'url' && (
                        <div className="space-y-3">
                            <input
                                type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://wikipedia.org/wiki/..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <p className="text-xs text-neutral-500">The system will automatically extract the main article content.</p>
                        </div>
                    )}

                    {activeTab === 'file' && (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all">
                            <input
                                type="file"
                                id="admin-file"
                                className="hidden"
                                onChange={(e) => setFile(e.target.files[0])}
                                accept=".pdf,.epub,.txt,.docx"
                            />
                            <label htmlFor="admin-file" className="cursor-pointer flex flex-col items-center">
                                {file ? (
                                    <div className="flex items-center gap-2 text-amber-500 font-bold">
                                        <Check size={20} /> {file.name}
                                    </div>
                                ) : (
                                    <>
                                        <UploadCloud size={40} className="text-neutral-600 mb-2" />
                                        <span className="text-sm font-medium">Click to select file</span>
                                        <span className="text-xs text-neutral-600 mt-1">PDF, EPUB, TXT, DOCX</span>
                                    </>
                                )}
                            </label>
                        </div>
                    )}
                </div>

                <div className="mt-6">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 block">Initial Voice</label>
                    <div className="grid grid-cols-2 gap-2">
                        {voices.map(v => (
                            <button
                                key={v.id}
                                onClick={() => setSelectedVoice(v.id)}
                                className={`text-left px-3 py-2 rounded-xl text-sm border transition-all ${selectedVoice === v.id ? 'bg-white/10 border-amber-500/50 text-white' : 'bg-transparent border-white/5 text-neutral-500 hover:text-neutral-300'}`}
                            >
                                {v.name}
                            </button>
                        ))}
                    </div>
                </div>

                {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}

                <button
                    onClick={handleUpload}
                    disabled={isUploading || (activeTab === 'text' && !text) || (activeTab === 'url' && !url) || (activeTab === 'file' && !file)}
                    className="w-full mt-8 bg-white text-black py-3 rounded-xl font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-xl shadow-white/5"
                >
                    {isUploading ? <><Loader2 size={18} className="animate-spin" /> Processing...</> : "Start Generation"}
                </button>
                <p className="text-[10px] text-center text-neutral-600 mt-3">This will automatically mark the resulting notebook as Public.</p>
            </div>
        </div>
    );
}
