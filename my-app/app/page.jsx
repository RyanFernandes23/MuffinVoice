// import Header from './components/Header';
import Link from 'next/link';
// import Navbar from './components/Navbar';
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <main className="grow flex flex-col items-center justify-center p-6">
        <h1 className="text-7xl md:text-8xl font-extrabold text-center text-primary-dark mb-8 animate-float">
          WikiVoice
        </h1>
        <p className="text-xl md:text-2xl text-foreground mb-12 text-center max-w-2xl">
          Transform your articles into natural-sounding audio with AI-powered text-to-speech.
        </p>
        <Link href="/dashboard" className="bg-primary text-white px-8 py-4 rounded-full text-xl font-semibold hover:bg-primary-dark transition duration-300 ease-in-out btn-hover-lift animate-pulse-glow">
          Go to Dashboard
        </Link>
      </main>
    </div>
  );
}
