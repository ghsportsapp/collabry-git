import type { Response } from "express";

const creatorConnections = new Map<string, Set<Response>>();
const brandConnections = new Map<string, Set<Response>>();

export function addCreatorSSE(creatorId: string, res: Response): void {
  if (!creatorConnections.has(creatorId)) creatorConnections.set(creatorId, new Set());
  creatorConnections.get(creatorId)!.add(res);
}

export function removeCreatorSSE(creatorId: string, res: Response): void {
  const conns = creatorConnections.get(creatorId);
  if (!conns) return;
  conns.delete(res);
  if (conns.size === 0) creatorConnections.delete(creatorId);
}

export function addBrandSSE(brandId: string, res: Response): void {
  if (!brandConnections.has(brandId)) brandConnections.set(brandId, new Set());
  brandConnections.get(brandId)!.add(res);
}

export function removeBrandSSE(brandId: string, res: Response): void {
  const conns = brandConnections.get(brandId);
  if (!conns) return;
  conns.delete(res);
  if (conns.size === 0) brandConnections.delete(brandId);
}

export function broadcastToAllCreators(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, conns] of creatorConnections) {
    for (const res of conns) {
      try { res.write(payload); } catch { conns.delete(res); }
    }
  }
}

export function sendToCreator(creatorId: string, event: string, data: unknown): void {
  const conns = creatorConnections.get(creatorId);
  if (!conns) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(payload); } catch { conns.delete(res); }
  }
}

export function sendToBrand(brandId: string, event: string, data: unknown): void {
  const conns = brandConnections.get(brandId);
  if (!conns) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(payload); } catch { conns.delete(res); }
  }
}
