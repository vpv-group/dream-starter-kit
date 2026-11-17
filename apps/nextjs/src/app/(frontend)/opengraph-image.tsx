import { ImageResponse } from "next/og";

import {
  STARTER_KIT_LOGO_ASPECT,
  STARTER_KIT_LOGO_REVERSED_DATA_URL,
} from "~/lib/og-logo";

// Generated Open Graph image (no committed binary). Next wires this into the
// page <meta> automatically, overriding the openGraph.images default.
// Dream's share layout: the reversed logo on the ink ground.
export const alt = "Dream Starter Kit. Free forever. Open source.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOGO_HEIGHT = 88;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
        background: "#0B1121",
        color: "#F3F5F9",
        fontFamily: "sans-serif",
      }}
    >
      <img
        src={STARTER_KIT_LOGO_REVERSED_DATA_URL}
        alt=""
        width={Math.round(LOGO_HEIGHT * STARTER_KIT_LOGO_ASPECT)}
        height={LOGO_HEIGHT}
      />
      <div
        style={{
          fontSize: 52,
          fontWeight: 600,
          letterSpacing: "-0.025em",
          marginTop: 56,
        }}
      >
        Free forever. Open source.
      </div>
      <div style={{ fontSize: 30, marginTop: 20, color: "#B1B8C5" }}>
        Your website and iPhone and Android apps, on one Supabase backend.
      </div>
    </div>,
    size,
  );
}
