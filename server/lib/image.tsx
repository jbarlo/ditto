import sharp from "sharp";
import QRCode from "qrcode";
import { ImageResponse } from "next/og";
import { DISPLAY_WIDTH as WIDTH, DISPLAY_HEIGHT as HEIGHT } from "@/lib/config";


export async function generateTextImage(
  lines: string[],
  options: { fontSize?: number } = {}
): Promise<Buffer> {
  const fontSize = options.fontSize || 48;

  const response = new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "white",
          fontSize,
          color: "black",
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            {line}
          </div>
        ))}
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    }
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateClaimImage(
  friendlyId: string,
  claimCode: string,
  baseUrl: string
): Promise<Buffer> {
  const claimUrl = `${baseUrl}/claim?id=${friendlyId}&code=${claimCode}`;
  const qrSize = 280;

  const qrDataUrl = await QRCode.toDataURL(claimUrl, {
    margin: 1,
    width: qrSize,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const response = new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: "flex",
          backgroundColor: "white",
          color: "black",
          padding: 40,
        }}
      >
        {/* QR Code (left side) */}
        <img
          src={qrDataUrl}
          width={qrSize}
          height={qrSize}
          style={{ marginTop: 60 }}
        />

        {/* Right side content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 40,
            flex: 1,
          }}
        >
          {/* Title */}
          <div style={{ fontSize: 32, marginBottom: 40 }}>Claim this frame</div>

          {/* Device ID */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 18, color: "#666", width: 100 }}>Device ID:</span>
            <div
              style={{
                border: "2px solid black",
                borderRadius: 4,
                padding: "8px 16px",
                fontSize: 28,
                fontWeight: "bold",
              }}
            >
              {friendlyId}
            </div>
          </div>

          {/* Code */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
            <span style={{ fontSize: 18, color: "#666", width: 100 }}>Code:</span>
            <div
              style={{
                border: "2px solid black",
                borderRadius: 4,
                padding: "8px 16px",
                fontSize: 28,
                fontWeight: "bold",
              }}
            >
              {claimCode}
            </div>
          </div>

          {/* Instructions */}
          <div style={{ fontSize: 16, display: "flex", flexDirection: "column" }}>
            <span>Scan QR or visit:</span>
            <span style={{ color: "#333" }}>{baseUrl}/claim</span>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    }
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export interface StrokeData {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  tool: string;
}

export async function generateBlankCanvas(): Promise<Buffer> {
  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Composite strokes onto a base image.
 * Handles special "clear" tool type which resets to white.
 */
export async function compositeStrokes(
  baseImage: Buffer,
  strokes: { data: string }[]
): Promise<Buffer> {
  if (strokes.length === 0) {
    return baseImage;
  }

  let startIndex = 0;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke: StrokeData = JSON.parse(strokes[i]!.data);
    if (stroke.tool === "clear") {
      startIndex = i + 1; // Start after the clear stroke
      baseImage = await generateBlankCanvas(); // Reset base to white
      break;
    }
  }

  const relevantStrokes = strokes.slice(startIndex);
  if (relevantStrokes.length === 0) {
    return baseImage;
  }

  const paths = relevantStrokes
    .map((s) => {
      const stroke: StrokeData = JSON.parse(s.data);
      if (!stroke.points || stroke.points.length < 2) return "";

      const pathData = stroke.points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`)
        .join(" ");

      return `<path d="${pathData}" stroke="${escapeXml(stroke.color)}" stroke-width="${stroke.size}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .filter(Boolean)
    .join("\n");

  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;

  const svgBuffer = Buffer.from(svg);

  return sharp(baseImage)
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}
