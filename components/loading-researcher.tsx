'use client';

import { useEffect, useRef, useState } from "react";

export interface LoadingResearcherProps {
  isDataLoaded: boolean;
  onAnimationComplete?: () => void;
  message?: string;
}

const VENDORS = [
  { name: "1mg", color: "#fb7185", liquid: "#fb7185" },
  { name: "PharmEasy", color: "#c4b5fd", liquid: "#a78bfa" },
  { name: "Netmeds", color: "#fb7185", liquid: "#f43f5e" },
  { name: "Apollo", color: "#6ee7b7", liquid: "#10b981" },
  { name: "Truemeds", color: "#fdba74", liquid: "#f59e0b" },
  { name: "MedPlus", color: "#93c5fd", liquid: "#3b82f6" },
] as const;

const PORTAL_X = [0.08, 0.22, 0.36, 0.64, 0.78, 0.92] as const;
const CYCLE_MS = 5_400; // One complete pass through all six portals.
const FINISHER_MS = 2_000; // The result reveal always gets its full two seconds.

const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const easeInOut = (value: number): number => {
  const t = clamp(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const easeOut = (value: number): number => 1 - Math.pow(1 - clamp(value), 3);

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  glow = 0,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.stroke();
  ctx.restore();
}

function bottlePath(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const w = width;
  const h = height;
  ctx.beginPath();
  ctx.moveTo(-w * 0.17, -h * 0.5);
  ctx.lineTo(-w * 0.17, -h * 0.34);
  ctx.quadraticCurveTo(-w * 0.43, -h * 0.30, -w * 0.44, -h * 0.12);
  ctx.lineTo(-w * 0.48, h * 0.34);
  ctx.quadraticCurveTo(-w * 0.49, h * 0.49, -w * 0.32, h * 0.5);
  ctx.lineTo(w * 0.32, h * 0.5);
  ctx.quadraticCurveTo(w * 0.49, h * 0.49, w * 0.48, h * 0.34);
  ctx.lineTo(w * 0.44, -h * 0.12);
  ctx.quadraticCurveTo(w * 0.43, -h * 0.30, w * 0.17, -h * 0.34);
  ctx.lineTo(w * 0.17, -h * 0.5);
  ctx.closePath();
}

function drawBottleCap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
): void {
  ctx.save();
  roundedRectPath(ctx, -width * 0.20, -height * 0.54, width * 0.40, height * 0.12, 2.5);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.fill();
  ctx.restore();
}

function drawVendorBottle(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  width: number,
  height: number,
  vendor: (typeof VENDORS)[number],
  fillLevel: number,
  time: number,
  active: boolean,
  tilt: number,
  pickedUp = false,
): { x: number; y: number } {
  const centerY = baseY - height / 2;
  ctx.save();
  ctx.translate(x, centerY);
  ctx.rotate(tilt);

  // The halo marks the bottle being handled, without drawing a beam through the scene.
  if (active) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.012);
    ctx.beginPath();
    ctx.ellipse(0, 0, width * (0.68 + pulse * 0.08), height * 0.57, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(45, 212, 191, ${0.19 + pulse * 0.25})`;
    ctx.lineWidth = 1.1;
    ctx.shadowColor = '#2dd4bf';
    ctx.shadowBlur = 8 + pulse * 5;
    ctx.stroke();
  }

  bottlePath(ctx, width, height);
  ctx.save();
  ctx.clip();
  const liquidTop = height * (0.5 - clamp(fillLevel) * 0.77);
  const liquid = ctx.createLinearGradient(0, liquidTop, 0, height * 0.5);
  liquid.addColorStop(0, `${vendor.liquid}bb`);
  liquid.addColorStop(1, `${vendor.liquid}40`);
  ctx.fillStyle = liquid;
  ctx.fillRect(-width, liquidTop, width * 2, height);

  // Slow bubbles make each sample feel like a real liquid, not a static icon.
  for (let i = 0; i < 3; i += 1) {
    const bubbleY = height * 0.23 - ((time * 0.018 + i * height * 0.23) % (height * 0.46));
    const bubbleX = Math.sin(time * 0.002 + i * 2.1) * width * 0.17;
    ctx.beginPath();
    ctx.arc(bubbleX, bubbleY, 1 + (i % 2) * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(236, 254, 255, 0.68)';
    ctx.fill();
  }
  ctx.restore();

  bottlePath(ctx, width, height);
  ctx.fillStyle = 'rgba(148, 213, 228, 0.075)';
  ctx.fill();
  ctx.strokeStyle = active ? 'rgba(167, 243, 228, 0.96)' : 'rgba(148, 213, 228, 0.62)';
  ctx.lineWidth = active ? 1.35 : 1;
  ctx.shadowColor = active ? '#2dd4bf' : vendor.color;
  ctx.shadowBlur = active ? 9 : 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  strokeLine(ctx, -width * 0.32, -height * 0.08, -width * 0.34, height * 0.29, 'rgba(219, 252, 255, 0.54)', 1.1, 0);
  if (pickedUp) {
    // Uncapped neck while carried; the open rim rotates with the bottle.
    ctx.beginPath();
    ctx.ellipse(0, -height * 0.485, width * 0.17, Math.max(1.2, height * 0.022), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(3, 18, 31, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(219, 252, 255, 0.92)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -height * 0.485, width * 0.125, Math.max(0.7, height * 0.012), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(103, 232, 249, 0.42)';
    ctx.fill();
  } else {
    drawBottleCap(ctx, width, height, active ? '#a7f3d0' : 'rgba(165, 243, 252, 0.86)');
  }

  const fontSize = Math.max(5.2, Math.min(7.2, width * (vendor.name.length > 7 ? 0.155 : 0.19)));
  ctx.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(8, 17, 32, 0.90)';
  roundedRectPath(ctx, -width * 0.45, -height * 0.015, width * 0.90, Math.max(10, height * 0.22), 3);
  ctx.fill();
  ctx.fillStyle = vendor.color;
  ctx.fillText(vendor.name, 0, height * 0.09, width * 0.84);
  ctx.restore();

  const mouthX = x + Math.sin(tilt) * (height * 0.47);
  const mouthY = centerY - Math.cos(tilt) * (height * 0.50);
  return { x: mouthX, y: mouthY };
}

function drawDawaDaamBottle(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  width: number,
  height: number,
  fillLevel: number,
  time: number,
  finishing: boolean,
  finishProgress: number,
  reducedMotion: boolean,
): void {
  const centerY = baseY - height / 2;
  const pulse = reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(time * 0.008);
  const glow = finishing ? 12 + finishProgress * 28 : 4 + pulse * 6;
  ctx.save();
  ctx.translate(x, centerY);

  // Final two seconds draw the gathered solution inward like a gentle vortex.
  if (finishing) {
    for (let i = 0; i < 3; i += 1) {
      const ringT = clamp(finishProgress + i * 0.10);
      const radius = lerp(width * 1.1, width * 0.30, easeInOut(ringT));
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.42, time * 0.001 * (i % 2 ? -1 : 1), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${i % 2 ? "16, 185, 129" : "34, 211, 238"}, ${0.42 * (1 - ringT * 0.5)})`;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = i % 2 ? "#10b981" : "#22d3ee";
      ctx.shadowBlur = 9;
      ctx.stroke();
    }
  }

  bottlePath(ctx, width, height);
  ctx.save();
  ctx.clip();
  const liquidTop = height * (0.5 - clamp(fillLevel) * 0.79);
  const liquid = ctx.createLinearGradient(-width * 0.3, liquidTop, width * 0.3, height * 0.5);
  liquid.addColorStop(0, "rgba(103, 232, 249, 0.95)");
  liquid.addColorStop(0.48, "rgba(45, 212, 191, 0.94)");
  liquid.addColorStop(1, "rgba(16, 185, 129, 0.78)");
  ctx.fillStyle = liquid;
  ctx.fillRect(-width, liquidTop, width * 2, height);

  // Fluid surface has a subtle wave while the flask fills.
  const surfaceY = liquidTop;
  ctx.beginPath();
  ctx.moveTo(-width, surfaceY);
  ctx.bezierCurveTo(-width * 0.28, surfaceY + Math.sin(time * 0.007) * 2, width * 0.25, surfaceY - Math.sin(time * 0.007) * 2, width, surfaceY);
  ctx.lineTo(width, surfaceY + 4);
  ctx.lineTo(-width, surfaceY + 4);
  ctx.closePath();
  ctx.fillStyle = "rgba(236, 254, 255, 0.42)";
  ctx.fill();
  ctx.restore();

  bottlePath(ctx, width, height);
  ctx.fillStyle = "rgba(153, 246, 228, 0.075)";
  ctx.fill();
  ctx.strokeStyle = finishing ? "#a7f3d0" : "rgba(165, 243, 252, 0.90)";
  ctx.lineWidth = finishing ? 1.8 : 1.3;
  ctx.shadowColor = finishing ? "#10b981" : "#22d3ee";
  ctx.shadowBlur = glow;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // DawaDaam's cross-and-wordmark badge, painted directly into the canvas.
  const badgeW = width * 0.78;
  const badgeH = Math.max(24, height * 0.34);
  roundedRectPath(ctx, -badgeW / 2, -height * 0.02, badgeW, badgeH, 5);
  ctx.fillStyle = "rgba(5, 19, 33, 0.86)";
  ctx.fill();
  const crossY = -height * 0.02 + badgeH * 0.28;
  roundedRectPath(ctx, -4.5, crossY - 1.6, 9, 3.2, 1.5);
  ctx.fillStyle = "#6ee7b7";
  ctx.fill();
  roundedRectPath(ctx, -1.6, crossY - 4.5, 3.2, 9, 1.5);
  ctx.fill();
  ctx.font = `800 ${Math.max(6.5, Math.min(8.2, width * 0.19))}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#d1fae5";
  ctx.fillText("DawaDaam", 0, crossY + badgeH * 0.27, badgeW * 0.94);

  if (finishing && finishProgress > 0.72) {
    const shine = clamp((finishProgress - 0.72) / 0.18);
    ctx.globalAlpha = shine * 0.85;
    ctx.beginPath();
    ctx.arc(0, -height * 0.31, 2.5 + shine * 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#a7f3d0";
    ctx.shadowBlur = 12;
    ctx.fill();
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, reducedMotion: boolean): void {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#071521");
  bg.addColorStop(0.52, "#0b1120");
  bg.addColorStop(1, "#111c2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Fine, low-contrast lab grid and ambient glass glows.
  ctx.save();
  ctx.strokeStyle = "rgba(103, 232, 249, 0.045)";
  ctx.lineWidth = 1;
  const grid = Math.max(24, Math.min(36, width * 0.055));
  for (let x = grid * 0.5; x < width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height * 0.78);
    ctx.stroke();
  }
  for (let y = grid * 0.45; y < height * 0.76; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(width * 0.5, height * 0.5, 4, width * 0.5, height * 0.5, width * 0.65);
  glow.addColorStop(0, "rgba(6, 182, 212, 0.11)");
  glow.addColorStop(0.55, "rgba(16, 185, 129, 0.035)");
  glow.addColorStop(1, "rgba(2, 6, 23, 0.18)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 73.17) % 997) / 997 * width;
    const y = ((i * 37.91 + 14) % 431) / 431 * height * 0.70;
    const shimmer = reducedMotion ? 0.35 : 0.23 + (0.5 + 0.5 * Math.sin(time * 0.0015 + i)) * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, i % 4 === 0 ? 1.5 : 0.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(103, 232, 249, ${shimmer})`;
    ctx.fill();
  }

  // Tiny header and scanner badge.
  ctx.save();
  ctx.fillStyle = "#a7f3d0";
  ctx.shadowColor = "#10b981";
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.arc(17, 17, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.font = `800 ${Math.max(8, Math.min(10, width * 0.017))}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(226, 252, 255, 0.94)";
  ctx.fillText("CARTCURE LAB", 26, 17);
  ctx.font = `600 ${Math.max(7, Math.min(8.5, width * 0.014))}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(148, 213, 228, 0.85)";
  ctx.fillText("6 PHARMACY SOURCES", width - 13, 17);
  ctx.restore();
}

function drawScientistBody(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tableY: number,
  time: number,
  reducedMotion: boolean,
): void {
  const cx = width * 0.5;
  const headR = Math.max(11.5, Math.min(15.5, width * 0.027));
  const bob = reducedMotion ? 0 : Math.sin(time * 0.003) * 1.1;
  const headY = height * 0.245 + bob;
  const shoulderY = headY + headR * 1.34;
  const coatHalf = headR * 2.55;

  ctx.save();
  // A quiet curved chair-back hint supports the seated pose; no legs are shown.
  ctx.beginPath();
  ctx.moveTo(cx - headR * 2.9, tableY - height * 0.08);
  ctx.lineTo(cx - headR * 2.65, headY + headR * 2.25);
  ctx.quadraticCurveTo(cx, headY + headR * 1.42, cx + headR * 2.65, tableY - height * 0.08);
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Neck and teal scrubs peek out above a real coat silhouette.
  const neck = ctx.createLinearGradient(cx - 5, headY, cx + 6, shoulderY + 12);
  neck.addColorStop(0, '#f2c7a4');
  neck.addColorStop(1, '#c98f70');
  roundedRectPath(ctx, cx - headR * 0.36, headY + headR * 0.68, headR * 0.72, headR * 0.91, 3);
  ctx.fillStyle = neck;
  ctx.fill();

  const coat = ctx.createLinearGradient(cx - coatHalf, shoulderY, cx + coatHalf, tableY);
  coat.addColorStop(0, '#dbe7ee');
  coat.addColorStop(0.43, '#f8fbfd');
  coat.addColorStop(1, '#b8cbd8');
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.78, shoulderY - 1);
  ctx.quadraticCurveTo(cx - headR * 1.75, shoulderY - 1, cx - coatHalf, shoulderY + headR * 0.72);
  ctx.lineTo(cx - coatHalf * 1.13, tableY + 14);
  ctx.lineTo(cx + coatHalf * 1.13, tableY + 14);
  ctx.lineTo(cx + coatHalf, shoulderY + headR * 0.72);
  ctx.quadraticCurveTo(cx + headR * 1.75, shoulderY - 1, cx + headR * 0.78, shoulderY - 1);
  ctx.closePath();
  ctx.fillStyle = coat;
  ctx.shadowColor = 'rgba(103, 232, 249, 0.12)';
  ctx.shadowBlur = 7;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(148, 213, 228, 0.72)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Scrub shirt, pointed lapels, and little coat buttons add readable human detail.
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.67, shoulderY + 1);
  ctx.lineTo(cx, shoulderY + headR * 0.84);
  ctx.lineTo(cx + headR * 0.67, shoulderY + 1);
  ctx.lineTo(cx + headR * 0.50, tableY - height * 0.025);
  ctx.lineTo(cx - headR * 0.50, tableY - height * 0.025);
  ctx.closePath();
  ctx.fillStyle = '#0f5267';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.73, shoulderY + 1);
  ctx.lineTo(cx - headR * 0.12, shoulderY + headR * 0.82);
  ctx.lineTo(cx - headR * 0.53, tableY - height * 0.035);
  ctx.lineTo(cx - headR * 1.35, shoulderY + headR * 0.72);
  ctx.closePath();
  ctx.fillStyle = '#f7fbfd';
  ctx.fill();
  ctx.strokeStyle = 'rgba(91, 125, 145, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + headR * 0.73, shoulderY + 1);
  ctx.lineTo(cx + headR * 0.12, shoulderY + headR * 0.82);
  ctx.lineTo(cx + headR * 0.53, tableY - height * 0.035);
  ctx.lineTo(cx + headR * 1.35, shoulderY + headR * 0.72);
  ctx.closePath();
  ctx.fillStyle = '#eaf2f7';
  ctx.fill();
  ctx.strokeStyle = 'rgba(91, 125, 145, 0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Stethoscope loop, subtle pocket, and buttons.
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.55, shoulderY + 3);
  ctx.bezierCurveTo(cx - headR * 1.12, shoulderY + headR * 1.12, cx + headR * 0.72, shoulderY + headR * 1.12, cx + headR * 0.48, shoulderY + headR * 0.12);
  ctx.strokeStyle = 'rgba(14, 116, 144, 0.72)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + headR * 0.48, shoulderY + headR * 0.12, 2.1, 0, Math.PI * 2);
  ctx.fillStyle = '#67e8f9';
  ctx.fill();
  roundedRectPath(ctx, cx + headR * 1.12, shoulderY + headR * 1.10, headR * 0.78, headR * 0.63, 2.5);
  ctx.fillStyle = 'rgba(255,255,255,0.50)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(91,125,145,0.65)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + headR * 0.18, shoulderY + headR * 1.35, 1.1, 0, Math.PI * 2);
  ctx.arc(cx + headR * 0.18, shoulderY + headR * 1.92, 1.1, 0, Math.PI * 2);
  ctx.fillStyle = '#7c98aa';
  ctx.fill();

  // Face: warm skin, ears, hairline, brows, eyes, nose, and a calm smile.
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR * 0.80, headR, 0, 0, Math.PI * 2);
  const face = ctx.createLinearGradient(cx - headR, headY - headR, cx + headR, headY + headR);
  face.addColorStop(0, '#f9d6b8');
  face.addColorStop(0.65, '#e8b48e');
  face.addColorStop(1, '#c98f70');
  ctx.fillStyle = face;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 230, 205, 0.75)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(cx - headR * 0.79, headY + 1, headR * 0.13, headR * 0.22, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + headR * 0.79, headY + 1, headR * 0.13, headR * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e5b18b';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.81, headY - headR * 0.12);
  ctx.quadraticCurveTo(cx - headR * 0.95, headY - headR * 0.95, cx - headR * 0.15, headY - headR * 1.02);
  ctx.quadraticCurveTo(cx + headR * 0.56, headY - headR * 1.12, cx + headR * 0.82, headY - headR * 0.28);
  ctx.lineTo(cx + headR * 0.50, headY - headR * 0.42);
  ctx.quadraticCurveTo(cx + headR * 0.03, headY - headR * 0.16, cx - headR * 0.41, headY - headR * 0.38);
  ctx.lineTo(cx - headR * 0.70, headY + headR * 0.02);
  ctx.closePath();
  ctx.fillStyle = '#213346';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.75, headY - headR * 0.40);
  ctx.quadraticCurveTo(cx - headR * 0.18, headY - headR * 0.63, cx + headR * 0.68, headY - headR * 0.38);
  ctx.strokeStyle = '#31485e';
  ctx.lineWidth = 2.3;
  ctx.lineCap = 'round';
  ctx.stroke();

  const eyeY = headY + headR * 0.10;
  ctx.strokeStyle = '#68483d';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.48, eyeY - 2.1);
  ctx.lineTo(cx - headR * 0.18, eyeY - 2.5);
  ctx.moveTo(cx + headR * 0.18, eyeY - 2.5);
  ctx.lineTo(cx + headR * 0.48, eyeY - 2.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - headR * 0.31, eyeY, 1.2, 0, Math.PI * 2);
  ctx.arc(cx + headR * 0.31, eyeY, 1.2, 0, Math.PI * 2);
  ctx.fillStyle = '#183042';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + headR * 0.02, eyeY + 1.1);
  ctx.lineTo(cx - headR * 0.02, eyeY + headR * 0.24);
  ctx.lineTo(cx + headR * 0.12, eyeY + headR * 0.25);
  ctx.strokeStyle = 'rgba(151, 91, 67, 0.82)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.24, headY + headR * 0.52);
  ctx.quadraticCurveTo(cx, headY + headR * 0.67, cx + headR * 0.25, headY + headR * 0.51);
  ctx.strokeStyle = '#975f4e';
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.restore();
}

function drawScientistReachArm(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tableY: number,
  time: number,
  handX: number,
  handY: number,
  reducedMotion: boolean,
): void {
  const cx = width * 0.5;
  const headR = Math.max(11.5, Math.min(15.5, width * 0.027));
  const headY = height * 0.245 + (reducedMotion ? 0 : Math.sin(time * 0.003) * 1.1);
  const shoulderY = headY + headR * 1.34;
  const side = handX < cx ? -1 : 1;
  const shoulderX = cx + side * headR * 1.42;
  const elbowX = lerp(shoulderX, handX, 0.52) + side * Math.min(headR * 0.60, Math.abs(handX - shoulderX) * 0.055);
  const elbowY = Math.min(
    tableY - height * 0.13,
    Math.max(shoulderY + headR * 0.62, lerp(shoulderY, handY, 0.55) - height * 0.026),
  );
  const wristX = handX - side * 3.2;
  const wristY = handY + 1.5;
  const breathe = reducedMotion ? 0 : Math.sin(time * 0.004) * 0.8;

  ctx.save();
  // The sleeve is painted behind all vials, so it disappears behind the glass instead of crossing it.
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY + 2);
  ctx.quadraticCurveTo(lerp(shoulderX, elbowX, 0.55) + side * 5, lerp(shoulderY, elbowY, 0.32) + breathe, elbowX, elbowY);
  ctx.quadraticCurveTo(lerp(elbowX, wristX, 0.52) - side * 4, lerp(elbowY, wristY, 0.45) - 3, wristX, wristY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(64, 93, 113, 0.78)';
  ctx.lineWidth = 13;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(shoulderX, shoulderY + 2);
  ctx.quadraticCurveTo(lerp(shoulderX, elbowX, 0.55) + side * 5, lerp(shoulderY, elbowY, 0.32) + breathe, elbowX, elbowY);
  ctx.quadraticCurveTo(lerp(elbowX, wristX, 0.52) - side * 4, lerp(elbowY, wristY, 0.45) - 3, wristX, wristY);
  const sleeve = ctx.createLinearGradient(shoulderX, shoulderY, wristX, wristY);
  sleeve.addColorStop(0, '#f7fbfd');
  sleeve.addColorStop(0.55, '#d9e7ef');
  sleeve.addColorStop(1, '#f8fcff');
  ctx.strokeStyle = sleeve;
  ctx.lineWidth = 10;
  ctx.stroke();

  // A distinct elbow and cuff make the arm read as an articulated person, not a straight rod.
  ctx.beginPath();
  ctx.arc(elbowX, elbowY, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#e2edf4';
  ctx.fill();
  ctx.strokeStyle = 'rgba(95, 133, 154, 0.66)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.save();
  ctx.translate(wristX, wristY);
  ctx.rotate(side * 0.13);
  roundedRectPath(ctx, -5.3, -4.2, 10.6, 8.4, 2.7);
  ctx.fillStyle = '#8bddeb';
  ctx.fill();
  ctx.strokeStyle = 'rgba(28, 113, 137, 0.75)';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawScientistGlovedHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  finishing: boolean,
): void {
  ctx.save();
  ctx.translate(x, y);
  roundedRectPath(ctx, -5.8, -4.6, 11.6, 9.2, 3.4);
  ctx.fillStyle = finishing ? '#d1fae5' : '#f2fbff';
  ctx.shadowColor = finishing ? '#10b981' : '#67e8f9';
  ctx.shadowBlur = 5;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(93, 155, 178, 0.92)';
  ctx.lineWidth = 0.75;
  ctx.stroke();
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-1.9 + i * 1.4, -2.2 + i * 1.1);
    ctx.quadraticCurveTo(0.2 + i * 1.1, 0.4 + i * 1.0, 0.3 + i * 1.0, 2.4 + i * 0.8);
    ctx.strokeStyle = 'rgba(109, 169, 188, 0.95)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

function getScientistHandPosition(
  width: number,
  height: number,
  tableY: number,
  elapsed: number,
  finishing: boolean,
  finishProgress: number,
): { x: number; y: number } {
  const centerX = width * 0.5;
  const vendorH = height * 0.265;
  const targetW = Math.max(41, Math.min(57, width * 0.105));
  const targetH = height * 0.405;
  const baseY = tableY - 2;
  const targetCenterY = baseY - targetH / 2;
  const stepMs = CYCLE_MS / VENDORS.length;
  const cyclePos = elapsed % CYCLE_MS;
  const liveIndex = Math.floor(cyclePos / stepMs) % VENDORS.length;
  const q = clamp((cyclePos - liveIndex * stepMs) / stepMs);
  const sourceX = PORTAL_X[liveIndex] * width;
  const originalCenterY = baseY - vendorH / 2;
  const side = sourceX < centerX ? -1 : 1;
  const pourTilt = side < 0 ? 0.72 : -0.72;
  const holdX = centerX + side * (targetW * 0.82);
  const holdCenterY = targetCenterY - vendorH * 0.40;
  let bottleX = sourceX;
  let bottleCenterY = originalCenterY;
  let tilt = 0;

  if (q >= 0.12 && q < 0.30) {
    bottleCenterY = lerp(originalCenterY, holdCenterY, easeOut((q - 0.12) / 0.18));
  } else if (q >= 0.30 && q < 0.48) {
    bottleX = lerp(sourceX, holdX, easeInOut((q - 0.30) / 0.18));
    bottleCenterY = holdCenterY;
  } else if (q >= 0.48 && q < 0.58) {
    bottleX = holdX;
    bottleCenterY = holdCenterY;
    tilt = pourTilt * easeInOut((q - 0.48) / 0.10);
  } else if (q >= 0.58 && q < 0.80) {
    bottleX = holdX;
    bottleCenterY = holdCenterY;
    tilt = pourTilt;
  } else if (q >= 0.80 && q < 0.88) {
    bottleX = holdX;
    bottleCenterY = holdCenterY;
    tilt = pourTilt * (1 - easeInOut((q - 0.80) / 0.08));
  } else if (q >= 0.88 && q < 0.975) {
    const returning = easeInOut((q - 0.88) / 0.095);
    bottleX = lerp(holdX, sourceX, returning);
    bottleCenterY = lerp(holdCenterY, originalCenterY, returning);
    tilt = pourTilt * (1 - returning);
  }

  const gripFactor = q < 0.12
    ? 0
    : q < 0.30
      ? easeOut((q - 0.12) / 0.18)
      : q < 0.88
        ? 1
        : 1 - easeInOut((q - 0.88) / 0.095);
  const gripX = bottleX - Math.sin(tilt) * vendorH * 0.20;
  const gripY = bottleCenterY - Math.cos(tilt) * vendorH * 0.25;
  const hand = {
    x: lerp(sourceX, gripX, gripFactor),
    y: lerp(originalCenterY - vendorH * 0.34, gripY, gripFactor),
  };
  const idle = { x: centerX - targetW * 1.02, y: tableY - height * 0.105 };
  if (!finishing) return hand;
  return {
    x: lerp(hand.x, idle.x, easeInOut(finishProgress / 0.11)),
    y: lerp(hand.y, idle.y, easeInOut(finishProgress / 0.11)),
  };
}

function drawTransferStream(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  progress: number,
  time: number,
  intensity = 1,
): void {
  const p = clamp(progress);
  if (p <= 0 || p >= 1) return;
  const controlY = Math.min(fromY, toY) - 14;
  ctx.save();
  ctx.globalAlpha = intensity * (0.58 + 0.22 * Math.sin(time * 0.01));
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.bezierCurveTo(fromX, controlY, toX, controlY, toX, toY);
  ctx.strokeStyle = "rgba(45, 212, 191, 0.62)";
  ctx.lineWidth = 4;
  ctx.shadowColor = "#10b981";
  ctx.shadowBlur = 11;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.bezierCurveTo(fromX, controlY, toX, controlY, toX, toY);
  ctx.strokeStyle = "#cffafe";
  ctx.lineWidth = 1.2;
  ctx.shadowColor = "#67e8f9";
  ctx.shadowBlur = 7;
  ctx.stroke();

  // A few bright droplets move down the curve to the DawaDaam flask.
  for (let i = 0; i < 4; i += 1) {
    const u = (time * 0.0011 + i * 0.24) % 1;
    const inv = 1 - u;
    const x = inv * inv * inv * fromX + 3 * inv * inv * u * fromX + 3 * inv * u * u * toX + u * u * u * toX;
    const y = inv * inv * inv * fromY + 3 * inv * inv * u * controlY + 3 * inv * u * u * controlY + u * u * u * toY;
    ctx.beginPath();
    ctx.arc(x, y, i % 2 === 0 ? 1.8 : 1.3, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? "#ecfeff" : "#6ee7b7";
    ctx.shadowColor = "#2dd4bf";
    ctx.shadowBlur = 8;
    ctx.fill();
  }
  ctx.restore();
}

function drawResultBadge(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
  time: number,
  reducedMotion: boolean,
): void {
  const reveal = easeOut((progress - 0.73) / 0.19);
  if (reveal <= 0) return;
  const w = Math.min(width * 0.64, 290);
  const h = Math.max(27, Math.min(34, height * 0.15));
  const x = width / 2 - w / 2;
  const y = height * 0.355 - (1 - reveal) * 8;
  ctx.save();
  ctx.globalAlpha = reveal;
  roundedRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(5, 25, 31, 0.94)";
  ctx.shadowColor = "#10b981";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(110, 231, 183, 0.94)";
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Checkmark icon.
  ctx.beginPath();
  ctx.arc(x + h * 0.55, y + h * 0.5, h * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "#10b981";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + h * 0.42, y + h * 0.51);
  ctx.lineTo(x + h * 0.52, y + h * 0.61);
  ctx.lineTo(x + h * 0.69, y + h * 0.39);
  ctx.strokeStyle = "#ecfdf5";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.font = `800 ${Math.max(8.5, Math.min(11.5, width * 0.021))}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#d1fae5";
  ctx.fillText("LOWEST PRICES UNLOCKED!", width / 2 + h * 0.16, y + h * 0.51, w - h * 1.10);

  if (!reducedMotion) {
    for (let i = 0; i < 9; i += 1) {
      const phase = (time * 0.0012 + i * 0.117) % 1;
      const px = x + phase * w;
      const py = y + (i % 2 === 0 ? -3 : h + 3) + Math.sin(time * 0.004 + i) * 2;
      ctx.beginPath();
      ctx.arc(px, py, i % 3 === 0 ? 1.6 : 1, 0, Math.PI * 2);
      const particleColor = i % 2 === 0 ? "#6ee7b7" : "#67e8f9";
      ctx.fillStyle = particleColor;
      ctx.shadowColor = particleColor;
      ctx.shadowBlur = 5;
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsed: number,
  finishing: boolean,
  finishProgress: number,
  reducedMotion: boolean,
): void {
  const time = reducedMotion ? elapsed * 0.45 : elapsed;
  const centerX = width * 0.5;
  const tableY = height * 0.715;
  const vendorW = Math.max(29, Math.min(44, width * 0.084));
  const vendorH = height * 0.265;
  const targetW = Math.max(41, Math.min(57, width * 0.105));
  const targetH = height * 0.405;
  const targetX = centerX;
  const baseY = tableY - 2;
  const cyclePos = elapsed % CYCLE_MS;
  const stepMs = CYCLE_MS / VENDORS.length;
  const liveIndex = Math.floor(cyclePos / stepMs) % VENDORS.length;
  const liveProgress = clamp((cyclePos - liveIndex * stepMs) / stepMs);
  const activeIndex = finishing ? -1 : liveIndex;
  const targetCenterY = baseY - targetH / 2;
  const targetMouthY = baseY - targetH * 0.97;

  drawBackground(ctx, width, height, time, reducedMotion);

  // The lab-coated scientist is behind the counter and receiving flask.
  drawScientistBody(ctx, width, height, tableY, time, reducedMotion);

  const tableGrad = ctx.createLinearGradient(0, tableY, 0, height * 0.88);
  tableGrad.addColorStop(0, '#213b50');
  tableGrad.addColorStop(0.22, '#152b3e');
  tableGrad.addColorStop(1, '#0c1b2b');
  ctx.fillStyle = tableGrad;
  ctx.fillRect(0, tableY, width, height - tableY);
  ctx.fillStyle = 'rgba(125, 211, 252, 0.22)';
  ctx.fillRect(0, tableY, width, 1.3);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
  ctx.fillRect(0, tableY + 2, width, 2);
  ctx.fillStyle = 'rgba(2, 6, 23, 0.22)';
  ctx.fillRect(0, height * 0.86, width, height * 0.14);

  const vendorMouths: { x: number; y: number }[] = [];
  const scientistHand = getScientistHandPosition(width, height, tableY, elapsed, finishing, finishProgress);
  // Draw the sleeve before the glassware: individual flasks occlude it naturally as it reaches.
  drawScientistReachArm(ctx, width, height, tableY, time, scientistHand.x, scientistHand.y, reducedMotion);

  VENDORS.forEach((vendor, i) => {
    const sourceX = PORTAL_X[i] * width;
    const originalCenterY = baseY - vendorH / 2;
    const side = sourceX < targetX ? -1 : 1;
    const pourTilt = side < 0 ? 0.72 : -0.72;
    const holdX = targetX + side * (targetW * 0.82);
    const holdCenterY = targetCenterY - vendorH * 0.40;
    let bottleX = sourceX;
    let bottleCenterY = originalCenterY;
    let tilt = 0;
    let pickedUp = false;

    // A smooth 900ms action: reach, lift, carry, tip, pour, straighten, return.
    if (i === liveIndex) {
      const q = liveProgress;
      if (q < 0.12) {
        // Reach to the neck while the sample stays in its dock.
        bottleX = sourceX;
        bottleCenterY = originalCenterY;
      } else if (q < 0.30) {
        const lift = easeOut((q - 0.12) / 0.18);
        bottleCenterY = lerp(originalCenterY, holdCenterY, lift);
        pickedUp = true;
      } else if (q < 0.48) {
        const carry = easeInOut((q - 0.30) / 0.18);
        bottleX = lerp(sourceX, holdX, carry);
        bottleCenterY = holdCenterY;
        pickedUp = true;
      } else if (q < 0.58) {
        const tip = easeInOut((q - 0.48) / 0.10);
        bottleX = holdX;
        bottleCenterY = holdCenterY;
        tilt = pourTilt * tip;
        pickedUp = true;
      } else if (q < 0.80) {
        bottleX = holdX;
        bottleCenterY = holdCenterY;
        tilt = pourTilt;
        pickedUp = true;
      } else if (q < 0.88) {
        const straighten = easeInOut((q - 0.80) / 0.08);
        bottleX = holdX;
        bottleCenterY = holdCenterY;
        tilt = pourTilt * (1 - straighten);
        pickedUp = true;
      } else if (q < 0.975) {
        const returning = easeInOut((q - 0.88) / 0.095);
        bottleX = lerp(holdX, sourceX, returning);
        bottleCenterY = lerp(holdCenterY, originalCenterY, returning);
        tilt = pourTilt * (1 - returning);
        pickedUp = true;
      }
    }

    // If data resolves mid-action, gently dock the bottle over the first 220ms of the finisher.
    // This avoids a visible teleport as the six samples gather for the final reveal.
    if (finishing && finishProgress < 0.11 && i === liveIndex) {
      const dock = easeInOut(finishProgress / 0.11);
      const q = liveProgress;
      let liveX = sourceX;
      let liveY = originalCenterY;
      let liveTilt = 0;
      let livePicked = false;
      if (q >= 0.12 && q < 0.30) {
        liveY = lerp(originalCenterY, holdCenterY, easeOut((q - 0.12) / 0.18));
        livePicked = true;
      } else if (q >= 0.30 && q < 0.48) {
        liveX = lerp(sourceX, holdX, easeInOut((q - 0.30) / 0.18));
        liveY = holdCenterY;
        livePicked = true;
      } else if (q >= 0.48 && q < 0.58) {
        liveX = holdX;
        liveY = holdCenterY;
        liveTilt = pourTilt * easeInOut((q - 0.48) / 0.10);
        livePicked = true;
      } else if (q >= 0.58 && q < 0.88) {
        liveX = holdX;
        liveY = holdCenterY;
        liveTilt = q < 0.80 ? pourTilt : pourTilt * (1 - easeInOut((q - 0.80) / 0.08));
        livePicked = true;
      } else if (q >= 0.88 && q < 0.975) {
        const returning = easeInOut((q - 0.88) / 0.095);
        liveX = lerp(holdX, sourceX, returning);
        liveY = lerp(holdCenterY, originalCenterY, returning);
        liveTilt = pourTilt * (1 - returning);
        livePicked = true;
      }
      bottleX = lerp(liveX, sourceX, dock);
      bottleCenterY = lerp(liveY, originalCenterY, dock);
      tilt = liveTilt * (1 - dock);
      pickedUp = livePicked && dock < 0.78;
    }

    // Small recessed sample wells make the missing vial feel temporarily picked up.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sourceX, tableY - 1, vendorW * 0.49, 2.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(3, 16, 29, 0.72)';
    ctx.fill();
    ctx.strokeStyle = i === activeIndex ? 'rgba(103, 232, 249, 0.72)' : 'rgba(148, 213, 228, 0.17)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    let fill = i < activeIndex ? 0.25 : 0.65;
    if (i === liveIndex && !finishing) {
      if (liveProgress >= 0.58 && liveProgress < 0.80) {
        fill = lerp(0.65, 0.23, easeInOut((liveProgress - 0.58) / 0.22));
      } else if (liveProgress >= 0.80) {
        fill = 0.23;
      }
    }
    if (finishing) fill = lerp(0.65, 0.13, easeInOut(finishProgress));
    const isActive = i === activeIndex || (finishing && finishProgress < 0.11 && i === liveIndex);
    const mouth = drawVendorBottle(
      ctx,
      bottleX,
      bottleCenterY + vendorH / 2,
      vendorW,
      vendorH,
      vendor,
      fill,
      time,
      isActive,
      tilt,
      pickedUp,
    );
    vendorMouths.push(mouth);

  });

  const targetFill = finishing
    ? lerp(0.79, 1, easeInOut(clamp((finishProgress - 0.04) / 0.73)))
    : lerp(0.06, 0.79, easeInOut(Math.min(1, elapsed / CYCLE_MS)));
  drawDawaDaamBottle(ctx, targetX, baseY, targetW, targetH, targetFill, time, finishing, finishProgress, reducedMotion);

  // The glove is redrawn above the active vial while the sleeve remains behind the glassware.
  drawScientistGlovedHand(ctx, scientistHand.x, scientistHand.y, finishing);

  // Draw the liquid path after the arm so the scientist appears to pour into the receiving flask.
  if (finishing) {
    const gather = clamp((finishProgress - 0.11) / 0.76);
    if (gather > 0 && finishProgress < 0.96) {
      vendorMouths.forEach((mouth, i) => {
        drawTransferStream(ctx, mouth.x, mouth.y + 3, targetX, targetMouthY, 0.5, time + i * 113, 0.28 + finishProgress * 0.40);
      });
    }

    if (finishProgress > 0.34 && finishProgress < 0.82) {
      const beamP = (finishProgress - 0.34) / 0.48;
      const beamY = lerp(height * 0.47, height * 0.60, beamP);
      const beamAlpha = Math.sin(beamP * Math.PI) * 0.58;
      const beam = ctx.createLinearGradient(0, beamY, width, beamY);
      beam.addColorStop(0, 'rgba(16, 185, 129, 0)');
      beam.addColorStop(0.30, `rgba(16, 185, 129, ${beamAlpha})`);
      beam.addColorStop(0.50, `rgba(103, 232, 249, ${beamAlpha})`);
      beam.addColorStop(0.72, `rgba(16, 185, 129, ${beamAlpha})`);
      beam.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.save();
      ctx.strokeStyle = beam;
      ctx.lineWidth = 3 + Math.sin(beamP * Math.PI) * 3;
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, beamY);
      ctx.lineTo(width, beamY);
      ctx.stroke();
      ctx.restore();
    }

    if (finishProgress > 0.42 && finishProgress < 0.96) {
      const orbProgress = (finishProgress - 0.42) / 0.54;
      for (let i = 0; i < 20; i += 1) {
        const angle = i * (Math.PI * 2 / 20) + time * (reducedMotion ? 0.0008 : 0.0022);
        const radius = lerp(width * 0.18, targetW * 0.25, easeInOut(orbProgress));
        const x = targetX + Math.cos(angle) * radius;
        const y = baseY - targetH * 0.48 + Math.sin(angle) * radius * 0.50;
        ctx.beginPath();
        ctx.arc(x, y, i % 4 === 0 ? 2 : 1.2, 0, Math.PI * 2);
        const particleColor = i % 2 === 0 ? '#a7f3d0' : '#67e8f9';
        ctx.fillStyle = particleColor;
        ctx.shadowColor = particleColor;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
    }
    drawResultBadge(ctx, width, height, finishProgress, time, reducedMotion);
  } else if (activeIndex >= 0 && liveProgress >= 0.58 && liveProgress < 0.80) {
    const mouth = vendorMouths[activeIndex];
    drawTransferStream(ctx, mouth.x, mouth.y + 2, targetX, targetMouthY, 0.5, time, 1);
  }

  // Low-key edge light makes the counter read as one contained UI panel.
  ctx.save();
  const edgeGlow = ctx.createLinearGradient(0, tableY, width, tableY);
  edgeGlow.addColorStop(0, 'rgba(16, 185, 129, 0.03)');
  edgeGlow.addColorStop(0.5, 'rgba(103, 232, 249, 0.18)');
  edgeGlow.addColorStop(1, 'rgba(16, 185, 129, 0.03)');
  ctx.fillStyle = edgeGlow;
  ctx.fillRect(0, tableY - 1, width, 1);
  ctx.restore();
}

export function LoadingResearcher({
  isDataLoaded,
  onAnimationComplete,
  message,
}: LoadingResearcherProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dataLoadedRef = useRef(isDataLoaded);
  const callbackRef = useRef(onAnimationComplete);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Keep live props current without restarting the animation when data arrives.
  dataLoadedRef.current = isDataLoaded;
  callbackRef.current = onAnimationComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    const panel = panelRef.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !panel || !ctx) return undefined;

    let animationFrame = 0;
    let startAt: number | null = null;
    let finishStartedAt: number | null = null;
    let hasCompleted = false;
    let reducedMotion = false;
    let viewWidth = 0;
    let viewHeight = 0;
    let pixelRatio = 1;

    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    reducedMotion = Boolean(mediaQuery?.matches);

    const resizeCanvas = () => {
      const rect = panel.getBoundingClientRect();
      viewWidth = Math.max(1, rect.width);
      viewHeight = Math.max(1, rect.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(viewWidth * pixelRatio);
      canvas.height = Math.round(viewHeight * pixelRatio);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resizeCanvas)
      : null;
    resizeObserver?.observe(panel);
    resizeCanvas();

    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
    };
    mediaQuery?.addEventListener?.("change", onMotionPreferenceChange);

    const drawFrame = (now: number) => {
      if (startAt === null) startAt = now;
      const elapsed = now - startAt;

      if (dataLoadedRef.current && elapsed >= CYCLE_MS && finishStartedAt === null) {
        finishStartedAt = now;
        setIsFinishing(true);
      }

      // If the fetch is invalidated mid-finish, return to the looping research state.
      if (!dataLoadedRef.current && finishStartedAt !== null && !hasCompleted) {
        finishStartedAt = null;
        setIsFinishing(false);
      }

      const finishing = finishStartedAt !== null && dataLoadedRef.current;
      const finishProgress = finishing ? clamp((now - finishStartedAt!) / FINISHER_MS) : 0;

      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawScene(ctx, viewWidth, viewHeight, elapsed, finishing, finishProgress, reducedMotion);

      if (finishing && finishProgress >= 1 && !hasCompleted) {
        hasCompleted = true;
        setIsComplete(true);
        callbackRef.current?.();
        return;
      }
      animationFrame = window.requestAnimationFrame(drawFrame);
    };

    animationFrame = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mediaQuery?.removeEventListener?.("change", onMotionPreferenceChange);
    };
  }, []);

  const statusMessage = isComplete
    ? "Lowest prices unlocked."
    : isFinishing
      ? "Combining the six pharmacy samples…"
      : message ?? "Researching prices across 6 pharmacy portals…";

  return (
    <section
      aria-label="DawaDaam medicine price research"
      style={{
        width: "100%",
        maxWidth: 680,
        marginInline: "auto",
        overflow: "hidden",
        border: "1px solid rgba(103, 232, 249, 0.16)",
        borderRadius: 18,
        background: "#0b1120",
        boxShadow: "0 16px 46px rgba(1, 8, 20, 0.28), inset 0 1px 0 rgba(255,255,255,0.025)",
        color: "#dbeafe",
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: "100%",
          height: "clamp(205px, 34vw, 238px)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          minHeight: 38,
          padding: "0 13px",
          borderTop: "1px solid rgba(103, 232, 249, 0.10)",
          background: "linear-gradient(90deg, rgba(16, 185, 129, 0.055), rgba(6, 182, 212, 0.035))",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 11,
          letterSpacing: "0.01em",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              flex: "0 0 auto",
              borderRadius: 999,
              background: isComplete ? "#34d399" : isFinishing ? "#67e8f9" : "#10b981",
              boxShadow: `0 0 10px ${isComplete ? "#34d399" : "#10b981"}`,
            }}
          />
          <span style={{ color: isComplete ? "#a7f3d0" : "#b6c8d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {statusMessage}
          </span>
        </span>
        <span style={{ color: "#688699", flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>
          {isComplete ? "READY" : isFinishing ? "MATCHING" : "LIVE SCAN"}
        </span>
      </div>
    </section>
  );
}

export default LoadingResearcher;
