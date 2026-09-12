import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';

// Plus de police "sans" chargée ici (Inter retiré) : --font-sans pointe directement sur "Times
// New Roman" (police système), voir globals.css. JetBrains Mono reste pour les usages
// fonctionnels à chasse fixe (codes-barres, SKU), voir le commentaire équivalent dans globals.css.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Chez Idrissou Boutique — Gestion',
  description: "Application de gestion pour Chez Idrissou Boutique (alimentation générale, Lomé)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={jetbrainsMono.variable}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              {children}
            </AuthProvider>
            {/* Notifications temporaires (succès/erreurs) — voir lib/queryClient.ts pour le
                filet de sécurité qui déclenche automatiquement les toasts d'erreur. */}
            <Toaster position="top-right" richColors closeButton />
          </QueryClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
