'use client';

import { motion } from 'framer-motion';

export default function ExperienceSection() {
    return (
        <div className="mt-8 w-full max-w-7xl px-4">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className="text-center mb-12"
            >
                <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Designed for Every Moment</h2>
                <p className="text-neutral-500 text-sm md:text-lg max-w-2xl mx-auto">
                    Whether you're finding peace in nature or multitasking at home, Aven Reader turns any text into an immersive companion.
                </p>
            </motion.div>

            <div className="flex flex-col md:flex-row gap-8 justify-center items-start">
                {/* Main Feature Image - Peaceful Garden Reading */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    className="w-full md:w-fit relative group rounded-none overflow-hidden border border-white/10 shadow-2xl shadow-white/5 h-[350px] md:h-[600px]"
                >
                    <img
                        src="https://images.unsplash.com/photo-1601962537915-9e17180327f5?q=80&w=1200&auto=format&fit=max&ixlib=rb-4.1.0"
                        alt="Reading in a sunny garden"
                        className="h-full w-auto object-contain transition-transform duration-1000 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-8 md:p-10">
                        <div className="max-w-md">
                            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Your Library, Narrated</h3>
                            <p className="text-neutral-400 text-sm md:text-base leading-relaxed">
                                Transform any PDF, EPUB, or web article into an immersive audio experience. Aven Reader turns static text into natural, high-fidelity narration.
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Side Images Stack */}
                <div className="w-full md:w-[350px] lg:w-[400px] flex flex-col gap-8 h-auto md:h-[600px]">
                    {/* Mother and Child reading */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="flex-1 relative group rounded-none overflow-hidden border border-white/10"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1657009933507-4092b2b843b7?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8bGFwdG9wJTIwaW4lMjB0aGUlMjBnYXJkZW58ZW58MHx8MHx8fDA%3D"
                            alt="Person focused on using a tablet with simplified interface"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-8">
                            <h4 className="text-xl font-bold text-white mb-1">Accessibility First</h4>
                            <p className="text-sm text-neutral-400">Empower every reader with audio-enabled content, from bedtime stories to educational reports.</p>
                        </div>
                    </motion.div>

                    {/* Person with Headphones */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="flex-1 relative group rounded-none overflow-hidden border border-white/10"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1770622006017-4bb4cc9033e3?q=80&w=687&auto=format&fit=crop&ixlib=rb-4.1.0"
                            alt="Person listening with premium headphones"
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent flex flex-col justify-end p-8">
                            <h4 className="text-xl font-bold text-white mb-1">Productivity Reimagined</h4>
                            <p className="text-sm text-neutral-400">Master your reading list while you commute, exercise, or multitask with our human-like AI voices.</p>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
