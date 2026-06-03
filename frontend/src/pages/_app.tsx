import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/context/AuthContext";
import "@/styles/globals.css";

const AUTH_PAGES = ["/login", "/register"];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isAuthPage = AUTH_PAGES.includes(router.pathname);

  return (
    <AuthProvider>
      {isAuthPage ? (
        <Component {...pageProps} />
      ) : (
        <AppShell>
          <Component {...pageProps} />
        </AppShell>
      )}
    </AuthProvider>
  );
}
