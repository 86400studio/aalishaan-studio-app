"use client";

import { useEffect, useMemo } from "react";

import {
  useBagValidation,
  type BagContextValue,
} from "@/components/commerce/bag-provider";
import type { BagValidationResult } from "@/lib/schemas/bag";

import {
  bagLines,
  bagStatusMessages,
  currentAnswer,
  rememberArtworks,
  validationFailed,
  type ArtworkFacts,
  type BagView,
} from "./bag-lines";

/**
 * The bag as the drawer and the cart draw it — S1.5: `useBagValidation(active)` (src/components/commerce/
 * bag-provider.tsx; validation runs while `active`) with the rows' display lines and status sentences of
 * ./bag-lines.ts. The artworks named by this page's answers are remembered for the page's life (titles and
 * orientations only, never a price, never stored), so a row being edited stays drawn while its new revision is
 * checked; the cache is filled after each render, never during one.
 */

const knownArtworks = new Map<string, ArtworkFacts>();

export type BagLinesValue = BagContextValue &
  BagView & {
    /** The answer for the current revision, or null. */
    answer: BagValidationResult | null;
    messages: string[];
    failed: boolean;
  };

export function useBagLines(active = true): BagLinesValue {
  const bag = useBagValidation(active);
  const { snapshot, validation } = bag;
  const answer = currentAnswer(snapshot, validation);

  useEffect(() => {
    if (answer) rememberArtworks(knownArtworks, answer);
  }, [answer]);

  const view = useMemo(
    () => bagLines(snapshot.rows, answer, knownArtworks),
    [snapshot.rows, answer],
  );
  const messages = useMemo(
    () => bagStatusMessages(snapshot, validation),
    [snapshot, validation],
  );

  return {
    ...bag,
    ...view,
    answer,
    messages,
    failed: validationFailed(snapshot, validation),
  };
}
