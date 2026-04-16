import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Bitiq Lab - Autonomous Trading Strategy Research Platform" />
        <style>{`
          html, body {
            background-color: #020617 !important;
            color: #f1f5f9 !important;
          }
        `}</style>
      </Head>
      <body className="bg-slate-950 text-slate-100">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
