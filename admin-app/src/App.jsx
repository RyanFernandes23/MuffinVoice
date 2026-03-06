import { SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";
import Dashboard from "./Dashboard";

export default function App() {
    return (
        <div className="min-h-screen flex flex-col">
            <header className="p-4 border-b border-white/10 flex justify-between items-center bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
                <h1 className="text-xl font-bold tracking-tight">WikiVoice <span className="text-amber-500 underline decoration-amber-500/30">Admin</span></h1>
                <SignedIn>
                    <div className="flex items-center gap-4">
                        <UserButton afterSignOutUrl="/" />
                    </div>
                </SignedIn>
            </header>

            <main className="flex-1">
                <SignedOut>
                    <div className="flex items-center justify-center p-12">
                        <SignIn />
                    </div>
                </SignedOut>
                <SignedIn>
                    <Dashboard />
                </SignedIn>
            </main>

            <footer className="p-4 border-t border-white/5 text-center text-xs text-neutral-600">
                WikiVoice Admin Panel • Localhost Only
            </footer>
        </div>
    );
}
