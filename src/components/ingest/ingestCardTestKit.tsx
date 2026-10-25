/**
 * Test kit for `IngestStatusCard`, which only READS `useIngestStatusStore` (the rail's one poller).
 * `SeededCard` writes a row (and clears any not-found mark) into the store BEFORE the card's
 * first render, so a test can draw a specific status synchronously.
 */
import { useState } from "react";
import { IngestStatusCard, type IngestStatusCardProps } from "./IngestStatusCard";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import type { IngestStatusRow } from "@/lib/ingestWire";

export function seedIngestRow(row: IngestStatusRow): void {
  useIngestStatusStore.setState((s) => {
    const notFound = { ...s.notFound };
    delete notFound[row.ingest_id];
    return { rows: { ...s.rows, [row.ingest_id]: row }, notFound };
  });
}

export function SeededCard({ seed, ...rest }: IngestStatusCardProps & { seed: IngestStatusRow }) {
  useState(() => seedIngestRow(seed));
  return <IngestStatusCard {...rest} />;
}
