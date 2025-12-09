import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import Navbar from './components/Navbar' // Import the Navbar component

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="flex flex-col h-screen">
          <Navbar /> {/* Render the Navbar here */}
          <main className="grow">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  )
}
