"use client";
/**
 * The last net under everything, including the root layout itself.
 *
 * It replaces the whole document, so it cannot use the app's providers - no
 * translations, no theme, no Tailwind guarantees. Both languages are written
 * out by hand and the styles are inline, because at this point nothing else
 * can be relied on to have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="am">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          textAlign: "center",
          background: "#faf7f2",
          color: "#1c1917",
          font: "16px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
          የሆነ ስህተት ተፈጥሯል
        </h1>
        <p style={{ margin: 0, maxWidth: 360, color: "#57534e" }}>
          መተግበሪያውን እንደገና ይክፈቱ። የመዘገቡት ሽያጭ በስልኩ ላይ ተቀምጧል፤ አልጠፋም።
        </p>

        <h2 style={{ margin: "16px 0 0", fontSize: 17, fontWeight: 700 }}>
          Something went wrong
        </h2>
        <p style={{ margin: 0, maxWidth: 360, color: "#57534e" }}>
          Reopen the app. Any sale you recorded is still saved on this phone and
          will be sent when there is signal.
        </p>

        <button
          onClick={reset}
          style={{
            marginTop: 12,
            padding: "12px 20px",
            border: 0,
            borderRadius: 12,
            background: "#1c1917",
            color: "#faf7f2",
            font: "inherit",
            fontWeight: 600,
          }}
        >
          እንደገና ሞክር · Try again
        </button>

        {error.digest ? (
          <p style={{ margin: 0, fontFamily: "monospace", fontSize: 11, color: "#a8a29e" }}>
            {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
