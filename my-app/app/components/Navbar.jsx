import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import UsageProgress from './UsageProgress';

export default function Navbar() {
  return (
    <nav className="bg-black p-4 sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <div className="text-yellow-400 font-bold text-xl">
          <Link href="/">Muffin</Link>
        </div>
        <div className="flex space-x-4 items-center">
          <Link href="/pricing" className="text-yellow-400 hover:text-white">Pricing</Link>
          <Link href="/dashboard" className="text-yellow-400 hover:text-white">Dashboard</Link>
          <SignedIn>
            <UsageProgress />
            {/* Mount the UserButton component */}
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            {/* Signed out users get sign in button */}
            <Link href="/sign-in" className="text-yellow-400 hover:text-white">Sign In</Link>
            <Link href="/sign-up" className="text-yellow-400 hover:text-white">Sign Up</Link>
          </SignedOut>
        </div>
      </div>
    </nav>
  );
}
