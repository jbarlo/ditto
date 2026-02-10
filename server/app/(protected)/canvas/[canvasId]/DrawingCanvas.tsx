"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { DISPLAY_WIDTH as WIDTH, DISPLAY_HEIGHT as HEIGHT, DISPLAY_COLORS as COLORS, MAX_BRUSH_SIZE, STROKE_POLL_INTERVAL as POLL_INTERVAL } from "@/lib/config";
import { route } from "@/lib/routes";

interface Point {
  x: number;
  y: number;
}

interface StrokeData {
  points: Point[];
  color: string;
  size: number;
  tool: string;
}

interface LocalStroke {
  id: string;
  data: StrokeData;
  createdAt: string;
}


interface DrawingCanvasProps {
  canvasId: string;
  initialImageUrl?: string;
  readOnly?: boolean;
}

export default function DrawingCanvas({
  canvasId,
  initialImageUrl,
  readOnly,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleEndRef = useRef<() => void>(() => {});
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [brushSize, setBrushSize] = useState(4);
  const [brushColor, setBrushColor] = useState("#000000");
  const [localStrokes, setLocalStrokes] = useState<LocalStroke[]>([]);
  const [lastPollTime, setLastPollTime] = useState<string | undefined>();
  const [baseImageLoaded, setBaseImageLoaded] = useState(false);
  const baseImageRef = useRef<HTMLImageElement | null>(null);

  const strokesQuery = trpc.strokes.list.useQuery(
    { canvasId, since: lastPollTime },
    {
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
    }
  );

  const createStroke = trpc.strokes.create.useMutation();
  const clearCanvas = trpc.strokes.clear.useMutation();

  useEffect(() => {
    if (strokesQuery.data && strokesQuery.data.length > 0) {
      const remoteStrokes = strokesQuery.data;
      setLocalStrokes((prev) => {
        const ids = new Set(prev.map((s) => s.id));
        const newStrokes = remoteStrokes
          .filter((s) => !ids.has(s.id))
          .map((s) => ({
            id: s.id,
            data: JSON.parse(s.data) as StrokeData,
            createdAt: s.createdAt ?? new Date().toISOString(),
          }));
        return [...prev, ...newStrokes];
      });
      const newest = remoteStrokes[remoteStrokes.length - 1];
      if (newest?.createdAt) {
        setLastPollTime(newest.createdAt);
      }
    }
  }, [strokesQuery.data]);

  useEffect(() => {
    if (!initialImageUrl) {
      setBaseImageLoaded(true);
      return;
    }

    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      setBaseImageLoaded(true);
    };
    img.onerror = () => {
      setBaseImageLoaded(true);
    };
    img.src = initialImageUrl;
  }, [initialImageUrl]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    let startIndex = 0;
    for (let i = localStrokes.length - 1; i >= 0; i--) {
      if (localStrokes[i]?.data.tool === "clear") {
        startIndex = i + 1;
        break;
      }
    }

    if (startIndex === 0 && baseImageRef.current) {
      ctx.drawImage(baseImageRef.current, 0, 0, WIDTH, HEIGHT);
    }

    for (let i = startIndex; i < localStrokes.length; i++) {
      drawStroke(ctx, localStrokes[i]!.data);
    }

    if (currentStroke.length > 1) {
      drawStroke(ctx, {
        points: currentStroke,
        color: brushColor,
        size: brushSize,
        tool: "brush",
      });
    }
  }, [localStrokes, currentStroke, brushColor, brushSize]);

  useEffect(() => {
    if (baseImageLoaded) {
      redrawCanvas();
    }
  }, [baseImageLoaded, redrawCanvas]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;

    if ("touches" in e) {
      const touch = e.touches[0];
      if (!touch) return null;
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const getCoordsFromNative = (e: MouseEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (readOnly) return;
    const point = getCoords(e);
    if (!point) return;

    setIsDrawing(true);
    setCurrentStroke([point]);

    // Track mouse on window so dragging outside canvas still works
    if (!("touches" in e)) {
      const handleWindowMove = (ev: MouseEvent) => {
        const pt = getCoordsFromNative(ev);
        if (pt) {
          setCurrentStroke((prev) => [...prev, pt]);
        }
      };

      const handleWindowUp = () => {
        window.removeEventListener("mousemove", handleWindowMove);
        window.removeEventListener("mouseup", handleWindowUp);
        handleEndRef.current();
      };

      window.addEventListener("mousemove", handleWindowMove);
      window.addEventListener("mouseup", handleWindowUp);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    // Only handle touch moves here; mouse moves handled by window listener
    if (!isDrawing || !("touches" in e)) return;

    const point = getCoords(e);
    if (!point) return;

    setCurrentStroke((prev) => [...prev, point]);
  };

  const handleEnd = async () => {
    if (!isDrawing || currentStroke.length < 2) {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    setIsDrawing(false);

    const strokeData: StrokeData = {
      points: currentStroke,
      color: brushColor,
      size: brushSize,
      tool: "brush",
    };

    const tempId = `temp-${Date.now()}`;
    const tempStroke: LocalStroke = {
      id: tempId,
      data: strokeData,
      createdAt: new Date().toISOString(),
    };
    setLocalStrokes((prev) => [...prev, tempStroke]);
    setCurrentStroke([]);

    try {
      const result = await createStroke.mutateAsync({
        canvasId,
        data: strokeData,
      });
      setLocalStrokes((prev) =>
        prev.map((s) =>
          s.id === tempId
            ? { ...s, id: result.id, createdAt: result.createdAt ?? s.createdAt }
            : s
        )
      );
      if (result.createdAt) {
        setLastPollTime(result.createdAt);
      }
    } catch (e) {
      console.error("Failed to save stroke:", e);
    }
  };

  handleEndRef.current = handleEnd;

  const handleClear = async () => {
    if (!confirm("Clear entire canvas? This cannot be undone.")) return;

    const clearStroke: LocalStroke = {
      id: `temp-clear-${Date.now()}`,
      data: { tool: "clear", points: [], color: "#ffffff", size: 0 },
      createdAt: new Date().toISOString(),
    };
    setLocalStrokes((prev) => [...prev, clearStroke]);
    baseImageRef.current = null;

    try {
      await clearCanvas.mutateAsync({ canvasId });
    } catch (e) {
      console.error("Failed to clear canvas:", e);
    }
  };

  return (
    <div style={{ fontFamily: "monospace", padding: "1rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <a
          href={route("/home")}
          style={{ color: "#333", textDecoration: "none" }}
        >
          &larr; Back
        </a>
      </div>

      {!readOnly && (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "1rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            Size:
            <input
              type="range"
              min="1"
              max={MAX_BRUSH_SIZE}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ width: "100px" }}
            />
            <span style={{ width: "2ch" }}>{brushSize}</span>
          </label>

          <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
            Color:
            {COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setBrushColor(color)}
                style={{
                  width: "28px",
                  height: "28px",
                  backgroundColor: color,
                  border:
                    brushColor === color ? "3px solid #0066cc" : "1px solid #999",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                title={color}
              />
            ))}
          </div>

          <button
            onClick={handleClear}
            disabled={clearCanvas.isPending}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: clearCanvas.isPending ? "wait" : "pointer",
              opacity: clearCanvas.isPending ? 0.7 : 1,
            }}
          >
            {clearCanvas.isPending ? "Clearing..." : "Clear"}
          </button>
        </div>
      )}

      <div
        style={{
          border: "2px solid #333",
          display: "inline-block",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          style={{
            display: "block",
            maxWidth: "100%",
            height: "auto",
            cursor: readOnly ? "default" : "crosshair",
          }}
          onMouseDown={handleStart}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>

      <p style={{ color: "#666", fontSize: "0.875rem", marginTop: "0.5rem" }}>
        {readOnly
          ? "View only. Changes from others sync every few seconds."
          : "Draw with mouse or touch. Changes sync every few seconds."}
      </p>
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData) {
  if (stroke.tool === "clear" || stroke.points.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const first = stroke.points[0]!;
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < stroke.points.length; i++) {
    const pt = stroke.points[i]!;
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
}
