'use client';

import { useEffect, useRef } from "react";

export type CoreState = "idle" | "working" | "verified" | "failed";

type Vec3 = [number, number, number];

function buildIcosphere(): { verts: Vec3[]; edges: Array<[number, number]> } {
  const t = (1 + Math.sqrt(5)) / 2;
  const base: Vec3[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  const faces: Array<[number, number, number]> = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  const verts: Vec3[] = base.map(normalize);
  const cache = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const va = verts[a]!;
    const vb = verts[b]!;
    verts.push(normalize([va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]));
    const index = verts.length - 1;
    cache.set(key, index);
    return index;
  };

  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([a, b]);
  };

  for (const [a, b, c] of faces) {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    for (const tri of [
      [a, ab, ca],
      [b, bc, ab],
      [c, ca, bc],
      [ab, bc, ca],
    ] as Array<[number, number, number]>) {
      addEdge(tri[0], tri[1]);
      addEdge(tri[1], tri[2]);
      addEdge(tri[2], tri[0]);
    }
  }

  return { verts, edges };
}

function normalize([x, y, z]: Vec3): Vec3 {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

const PALETTE: Record<CoreState, { core: string; node: string; glow: string }> = {
  idle: { core: "59, 130, 246", node: "59, 130, 246", glow: "59, 130, 246" },
  working: { core: "245, 166, 35", node: "245, 166, 35", glow: "245, 166, 35" },
  verified: { core: "62, 207, 142", node: "62, 207, 142", glow: "62, 207, 142" },
  failed: { core: "232, 93, 74", node: "232, 93, 74", glow: "232, 93, 74" },
};

export function RepairCore({
  state = "idle",
  className,
  interactive = false,
}: {
  state?: CoreState;
  className?: string;
  /** Enables drag-to-rotate, pointer parallax, wheel zoom and click shockwaves. */
  interactive?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<CoreState>(state);
  stateRef.current = state;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const { verts, edges } = buildIcosphere();
    let frame = 0;
    let raf = 0;
    let visible = true;
    let w = 0;
    let h = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Interaction state
    let dragging = false;
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let dragYaw = 0;
    let dragPitch = 0;
    let velYaw = 0;
    let velPitch = 0;
    let hoverX = 0; // -1..1
    let hoverY = 0;
    let targetHoverX = 0;
    let targetHoverY = 0;
    let zoom = 1;
    let targetZoom = 1;
    let hovering = false;
    const shockwaves: Array<{ x: number; y: number; t: number }> = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true;
      },
      { rootMargin: "120px" },
    );
    io.observe(canvas);

    const localPoint = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!interactiveRef.current) return;
      dragging = true;
      pointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      velYaw = 0;
      velPitch = 0;
      targetZoom = 1.06;
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!interactiveRef.current) return;
      const p = localPoint(e);
      targetHoverX = (p.x / Math.max(1, w)) * 2 - 1;
      targetHoverY = (p.y / Math.max(1, h)) * 2 - 1;
      hovering = true;
      if (!dragging || e.pointerId !== pointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      dragYaw += dx * 0.007;
      dragPitch = Math.max(-1.2, Math.min(1.2, dragPitch + dy * 0.006));
      velYaw = dx * 0.007;
      velPitch = dy * 0.006;
    };

    const endDrag = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      targetZoom = hovering ? 1.03 : 1;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone */
      }
    };

    const onPointerEnter = () => {
      if (!interactiveRef.current) return;
      hovering = true;
      targetZoom = 1.03;
    };

    const onPointerLeave = () => {
      hovering = false;
      targetHoverX = 0;
      targetHoverY = 0;
      targetZoom = 1;
    };

    const onClick = (e: MouseEvent) => {
      if (!interactiveRef.current) return;
      const rect = canvas.getBoundingClientRect();
      shockwaves.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, t: 0 });
      if (shockwaves.length > 4) shockwaves.shift();
    };

    const onWheel = (e: WheelEvent) => {
      if (!interactiveRef.current || !hovering) return;
      targetZoom = Math.max(0.8, Math.min(1.45, targetZoom - e.deltaY * 0.0009));
    };

    if (interactive) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", endDrag);
      canvas.addEventListener("pointercancel", endDrag);
      canvas.addEventListener("pointerenter", onPointerEnter);
      canvas.addEventListener("pointerleave", onPointerLeave);
      canvas.addEventListener("click", onClick);
      canvas.addEventListener("wheel", onWheel, { passive: true });
    }

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!visible || w === 0 || h === 0) return;

      // Ease interaction values for smoothness
      hoverX += (targetHoverX - hoverX) * 0.08;
      hoverY += (targetHoverY - hoverY) * 0.08;
      zoom += (targetZoom - zoom) * 0.1;
      if (!dragging) {
        dragYaw += velYaw;
        dragPitch = Math.max(-1.2, Math.min(1.2, dragPitch + velPitch));
        velYaw *= 0.94;
        velPitch *= 0.94;
        if (Math.abs(velYaw) < 0.00005) velYaw = 0;
        if (Math.abs(velPitch) < 0.00005) velPitch = 0;
      }

      const cx = w / 2 + hoverX * 10;
      const cy = h / 2 + hoverY * 10;
      const radius = Math.min(w, h) * 0.34 * zoom;
      const palette = PALETTE[stateRef.current];

      ctx.clearRect(0, 0, w, h);

      const time = frame / 60;
      const idleSpin = dragging ? 0 : 0.42;
      const ay = time * idleSpin + dragYaw + hoverX * 0.18;
      const ax = Math.sin(time * 0.24) * 0.42 + dragPitch + hoverY * 0.16;
      const breathe = 1 + Math.sin(time * 1.1) * (stateRef.current === "working" ? 0.035 : 0.014);

      const projected = verts.map(([x, y, z]) => {
        const x1 = x * Math.cos(ay) - z * Math.sin(ay);
        const z1 = x * Math.sin(ay) + z * Math.cos(ay);
        const y2 = y * Math.cos(ax) - z1 * Math.sin(ax);
        const z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
        const depth = 1 / (2.6 - z2);
        return {
          x: cx + x1 * radius * breathe * depth * 2.6,
          y: cy + y2 * radius * breathe * depth * 2.6,
          z: z2,
        };
      });

      // Halo
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.1);
      halo.addColorStop(0, `rgba(${palette.glow}, ${hovering ? 0.22 : 0.16})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Click shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const wv = shockwaves[i]!;
        wv.t += 1 / 60;
        const life = wv.t / 0.9;
        if (life >= 1) {
          shockwaves.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(${palette.glow}, ${(0.5 * (1 - life)).toFixed(3)})`;
        ctx.lineWidth = 1.5 * (1 - life) + 0.3;
        ctx.beginPath();
        ctx.arc(wv.x, wv.y, life * radius * 2.4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Edges
      for (const [a, b] of edges) {
        const pa = projected[a]!;
        const pb = projected[b]!;
        const depth = (pa.z + pb.z) / 2;
        const alpha = (0.08 + Math.max(0, (depth + 1) / 2) * 0.42) * (hovering ? 1.15 : 1);
        ctx.strokeStyle = `rgba(${palette.core}, ${Math.min(1, alpha).toFixed(3)})`;
        ctx.lineWidth = depth > 0 ? 1.1 : 0.6;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // Nodes — a travelling repair pulse walks the vertex ring
      const pulseIndex = Math.floor((time * 6) % projected.length);
      projected.forEach((p, i) => {
        const depth = Math.max(0, (p.z + 1) / 2);
        const active = i === pulseIndex || i === (pulseIndex + 13) % projected.length;
        const size = active ? 3.4 : 1.1 + depth * 1.3;
        ctx.fillStyle = active
          ? `rgba(${palette.node}, 0.95)`
          : `rgba(${palette.node}, ${(0.12 + depth * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = `rgba(${palette.node}, 0.35)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size + 5 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      frame += reduced ? 0.25 : 1;
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("pointerenter", onPointerEnter);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [interactive]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden
      style={interactive ? { touchAction: "none", cursor: "grab" } : undefined}
    />
  );
}
