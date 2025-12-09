import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="h-full bg-yellow-400">
      <div className="h-full flex items-center justify-center">
        <SignUp
          appearance={{
            elements: {
              rootBox: {
                maxWidth: "25rem",
              },
            },
          }}
        />
      </div>
    </div>
  );
}

