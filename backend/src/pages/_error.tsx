/**
 * Custom error page for API-only backend
 * This prevents Next.js from trying to use Html component during static export
 */

interface ErrorProps {
  statusCode?: number;
}

export default function Error({ statusCode }: ErrorProps) {
  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Error {statusCode || "Unknown"}</h1>
      <p>An error occurred while processing your request.</p>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: any) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};
