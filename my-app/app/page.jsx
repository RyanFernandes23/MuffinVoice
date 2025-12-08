// import Header from './components/Header';
import Link from 'next/link';
import Navbar from './components/Navbar';
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-yellow-400">
      <Navbar />
      <main className="grow flex flex-col items-center justify-center">
        <h1 className="text-6xl font-extrabold text-black mb-8">Muffin TTS</h1>
        <Link href="/dashboard" className="bg-black text-yellow-400 px-6 py-3 rounded-lg text-lg font-semibold hover:bg-gray-800 transition duration-300">
          Go to Dashboard
        </Link>
      </main>
    </div>
  );
}
