import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import Navbar from './components/Navbar'
import { Toaster } from 'react-hot-toast'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="flex flex-col h-screen">
          <Navbar />
          <main className="grow">
            <Toaster position="top-right" />
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  )
}
