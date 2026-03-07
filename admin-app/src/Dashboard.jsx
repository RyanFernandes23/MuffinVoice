import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Search, ToggleLeft, ToggleRight, Trash2, ExternalLink, RefreshCw, User, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminUpload from './AdminUpload';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function Dashboard() {
    const { getToken, userId } = useAuth();
    const [notebooks, setNotebooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState(null);
    const [showUpload, setShowUpload] = useState(false);

    const fetchNotebooks = async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/notebooks`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(res.status === 403 ? "Access Denied: You are not an admin." : "Failed to fetch notebooks");
            const data = await res.json();
            setNotebooks(data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotebooks();
    }, []);

    const togglePublic = async (jobId) => {
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/notebooks/${jobId}/toggle_public`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to toggle status");
            const updated = await res.json();
            setNotebooks(prev => prev.map(nb => nb.job_id === jobId ? updated : nb));
        } catch (err) {
            alert(err.message);
        }
    };

    const deleteNotebook = async (jobId) => {
        if (!confirm("Are you sure you want to delete this notebook? This action is permanent.")) return;
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE_URL}/api/admin/notebooks/${jobId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to delete notebook");
            setNotebooks(prev => prev.filter(nb => nb.job_id !== jobId));
        } catch (err) {
            alert(err.message);
        }
    };

    const filtered = notebooks.filter(nb =>
        nb.title.toLowerCase().includes(search.toLowerCase()) ||
        nb.user_id.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h2 className="text-3xl font-bold">Manage Notebooks</h2>
                    <p className="text-neutral-500 mt-1">Total: {notebooks.length} notebooks in database</p>
                </div>
                <button
                    onClick={fetchNotebooks}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-2 px-6 py-2 bg-white text-black hover:opacity-90 rounded-xl transition-all font-bold shadow-lg shadow-white/5"
                >
                    <Plus size={18} /> Create Free Audiobook
                </button>
            </div>

            {error ? (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400">
                    <p className="font-bold">Error</p>
                    <p>{error}</p>
                    <p className="mt-4 text-sm opacity-80">Make sure your User ID is added to ADMIN_USER_IDS in the backend .env file.</p>
                </div>
            ) : (
                <>
                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
                        <input
                            type="text"
                            placeholder="Search by title or user ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-medium"
                        />
                    </div>

                    <div className="bg-neutral-900/30 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/5 text-neutral-400 text-sm font-semibold border-b border-white/10">
                                    <th className="px-6 py-4">Status & Title</th>
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4">Created</th>
                                    <th className="px-6 py-4">Free Audiobook</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filtered.map(nb => (
                                    <tr key={nb.job_id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${nb.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : nb.status === 'processing' ? 'bg-amber-500 animate-pulse' : 'bg-neutral-600'}`} />
                                                <div>
                                                    <div className="font-bold">{nb.title}</div>
                                                    <div className="text-[10px] text-neutral-600 font-mono">{nb.job_id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-neutral-400 text-sm">
                                                <User size={14} />
                                                <span className="truncate max-w-[120px]" title={nb.user_id}>{nb.user_id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-500 text-sm">
                                            {new Date(nb.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => togglePublic(nb.job_id)}
                                                disabled={nb.status !== 'completed'}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${nb.is_public ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30' : 'bg-neutral-800 text-neutral-500 border border-white/5'}`}
                                            >
                                                {nb.is_public ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                                {nb.is_public ? 'Public' : 'Private'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button className="p-2 hover:bg-white/5 rounded-lg text-neutral-400 border border-transparent hover:border-white/10 transition-all">
                                                    <ExternalLink size={18} />
                                                </button>
                                                <button
                                                    onClick={() => deleteNotebook(nb.job_id)}
                                                    className="p-2 hover:bg-red-500/20 rounded-lg text-neutral-500 hover:text-red-500 border border-transparent hover:border-red-500/20 transition-all"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filtered.length === 0 && (
                            <div className="p-12 text-center text-neutral-600 font-medium">
                                No notebooks found matching your search.
                            </div>
                        )}
                    </div>
                </>
            )}

            <AnimatePresence>
                {showUpload && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                        >
                            <AdminUpload
                                onClose={() => setShowUpload(false)}
                                onComplete={() => {
                                    fetchNotebooks();
                                    setShowUpload(false);
                                }}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
