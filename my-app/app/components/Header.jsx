import { UserButton } from "@clerk/nextjs";

export default function Header() {
  return (
    <header className="flex items-center justify-between p-4 bg-blue-500 text-white">
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
