import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="bg-black p-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="text-yellow-400 font-bold text-xl">
          <Link href="/">Muffin</Link>
        </div>
        <div className="flex space-x-4">
          <Link href="/pricing" className="text-yellow-400 hover:text-white">Pricing</Link>
          <Link href="/login" className="text-yellow-400 hover:text-white">Login</Link>
          <Link href="/signup" className="text-yellow-400 hover:text-white">Signup</Link>
          <Link href="/dashboard" className="text-yellow-400 hover:text-white">Dashboard</Link>
        </div>
      </div>
    </nav>
  );
}
