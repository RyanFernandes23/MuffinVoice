'use client';

import { Toaster, ToastBar, toast } from 'react-hot-toast';
import { X } from 'lucide-react';

export default function ToastProvider() {
    return (
        <Toaster
            position="bottom-right"
            toastOptions={{
                duration: 3500,
                style: {
                    background: 'rgba(17, 17, 17, 0.8)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 12px 32px -8px rgba(0, 0, 0, 0.5)',
                    borderRadius: '0px',
                    fontSize: '14px',
                    fontWeight: '500',
                    padding: '12px 20px',
                    maxWidth: '400px',
                },
                success: {
                    iconTheme: {
                        primary: '#10b981',
                        secondary: 'transparent',
                    },
                    style: {
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                    }
                },
                error: {
                    iconTheme: {
                        primary: '#ef4444',
                        secondary: 'transparent',
                    },
                    style: {
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                    }
                },
                loading: {
                    iconTheme: {
                        primary: '#ffffff',
                        secondary: 'transparent',
                    },
                },
            }}
        >
            {(t) => (
                <ToastBar toast={t}>
                    {({ icon, message }) => (
                        <div className="flex items-center gap-3">
                            <div className="flex-1 leading-relaxed">{message}</div>
                            {t.type !== 'loading' && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toast.dismiss(t.id);
                                    }}
                                    className="p-1 hover:bg-white/10 rounded-none transition-colors text-neutral-400 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    )}
                </ToastBar>
            )}
        </Toaster>
    );
}
