import { UserButton } from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="flex items-center justify-between p-4 bg-blue-500 text-white">
      <h1 className="text-2xl font-bold">My App</h1>
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
