export type ElsewherePreference =
  | "local"
  | "hidden-gem"
  | "popular-worth-it"
  | "closest";

export function normalizeScore(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

export function calculateDistanceKm(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  const earthRadiusKm = 6371;

  const toRadians = (degrees: number) =>
    (degrees * Math.PI) / 180;

  const latitudeDifference =
    toRadians(latitude2 - latitude1);

  const longitudeDifference =
    toRadians(longitude2 - longitude1);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDifference / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
}

export function calculateDistanceScore(
  distanceKm: number | null
): number {
  if (distanceKm === null) return 0;
  if (distanceKm <= 0.5) return 100;
  if (distanceKm <= 1) return 95;
  if (distanceKm <= 2) return 85;
  if (distanceKm <= 5) return 70;
  if (distanceKm <= 10) return 50;
  return 30;
}

export function normalizeKeywords(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .filter(
      (item): item is string =>
        typeof item === "string"
    )
    .map((item) =>
      item.trim().replace(/\s+/g, " ")
    )
    .filter((item) => {
      const key = item.toLowerCase();

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

export function toggleKeyword(
  current: string[],
  keyword: string
): string[] {
  const [cleaned] =
    normalizeKeywords([keyword]);

  if (!cleaned) {
    return current;
  }

  const alreadySelected =
    current.some(
      (item) =>
        item.toLowerCase() ===
        cleaned.toLowerCase()
    );

  if (alreadySelected) {
    return current.filter(
      (item) =>
        item.toLowerCase() !==
        cleaned.toLowerCase()
    );
  }

  return normalizeKeywords([
    ...current,
    cleaned,
  ]);
}

function getKeywordScore(
  keywordScores: Record<string, number>,
  keyword: string
): number {
  const direct =
    keywordScores[keyword];

  if (
    typeof direct === "number" &&
    Number.isFinite(direct)
  ) {
    return normalizeScore(direct);
  }

  const matchingKey =
    Object.keys(keywordScores).find(
      (key) =>
        key.toLowerCase() ===
        keyword.toLowerCase()
    );

  if (!matchingKey) {
    return 0;
  }

  return normalizeScore(
    keywordScores[matchingKey]
  );
}

export function calculateElsewhereScore({
  preference,
  similarityScore,
  localScore,
  distinctivenessScore,
  chainLikelihood,
  popularityScore,
  focusMatchScore,
  distanceScore,
  hasSelectedFocus,
}: {
  preference: ElsewherePreference;
  similarityScore: number;
  localScore: number;
  distinctivenessScore: number;
  chainLikelihood: number;
  popularityScore: number;
  focusMatchScore: number;
  distanceScore: number;
  hasSelectedFocus: boolean;
}): number {
  let baseScore = 0;

  if (preference === "local") {
    baseScore =
      similarityScore * 0.45 +
      localScore * 0.30 +
      distinctivenessScore * 0.15 +
      distanceScore * 0.10 -
      chainLikelihood * 0.18;
  }

  if (preference === "hidden-gem") {
    baseScore =
      similarityScore * 0.38 +
      distinctivenessScore * 0.32 +
      localScore * 0.20 +
      distanceScore * 0.10 -
      popularityScore * 0.18 -
      chainLikelihood * 0.16;
  }

  if (
    preference ===
    "popular-worth-it"
  ) {
    baseScore =
      similarityScore * 0.52 +
      popularityScore * 0.23 +
      distinctivenessScore * 0.12 +
      localScore * 0.05 +
      distanceScore * 0.08 -
      chainLikelihood * 0.04;
  }

  if (preference === "closest") {
    baseScore =
      similarityScore * 0.38 +
      distanceScore * 0.44 +
      localScore * 0.10 +
      distinctivenessScore * 0.08 -
      chainLikelihood * 0.06;
  }

  /*
   * When the traveler explicitly chooses an experience,
   * it should meaningfully change the ranking.
   *
   * The general match still matters, so an irrelevant
   * business cannot win solely because of one keyword.
   */
  const finalScore =
    hasSelectedFocus
      ? baseScore * 0.65 +
        focusMatchScore * 0.35
      : baseScore;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(finalScore)
    )
  );
}

export function rankCandidates<
  T extends {
    placeId: string | null;
    distance: number | null;

    similarityScore: number;
    localScore: number;
    distinctivenessScore: number;
    chainLikelihood: number;
    popularityScore: number;

    keywordScores:
      Record<string, number>;
    personalizationBoost?: number;
    personalizationPenalty?: number;
    personalizationTieBreak?: number;
  }
>(
  candidates: T[],
  preference: ElsewherePreference,
  keywords: string[],
  distanceKm: number | null
) {
  const selected =
    normalizeKeywords(keywords);

  const filteredCandidates =
    candidates.filter(
      (candidate) => {
        /*
         * Keep completely irrelevant places out,
         * regardless of ranking mode.
         */
        if (
          normalizeScore(
            candidate.similarityScore
          ) < 30
        ) {
          return false;
        }

        /*
         * Distance options are true filters.
         *
         * All city = distanceKm === null.
         */
        if (
          distanceKm !== null
        ) {
          if (
            candidate.distance ===
            null
          ) {
            return false;
          }

          if (
            candidate.distance >
            distanceKm
          ) {
            return false;
          }
        }

        return true;
      }
    );

  const ranked =
    filteredCandidates.map(
      (candidate) => {
        let focusMatchScore = 0;

        if (selected.length > 0) {
          const total =
            selected.reduce(
              (
                sum,
                keyword
              ) =>
                sum +
                getKeywordScore(
                  candidate.keywordScores,
                  keyword
                ),
              0
            );

          focusMatchScore =
            total /
            selected.length;
        }

        const distanceScore =
          calculateDistanceScore(
            candidate.distance
          );

        const baseScore =
          calculateElsewhereScore({
            preference,

            similarityScore:
              normalizeScore(
                candidate.similarityScore
              ),

            localScore:
              normalizeScore(
                candidate.localScore
              ),

            distinctivenessScore:
              normalizeScore(
                candidate.distinctivenessScore
              ),

            chainLikelihood:
              normalizeScore(
                candidate.chainLikelihood
              ),

            popularityScore:
              normalizeScore(
                candidate.popularityScore
              ),

            focusMatchScore:
              normalizeScore(
                focusMatchScore
              ),

            distanceScore,

            hasSelectedFocus:
              selected.length > 0,
          });

        const elsewhereScore = Math.max(0, Math.min(100, baseScore + Math.max(0,Math.min(6,candidate.personalizationBoost ?? 0)) - Math.max(0,Math.min(6,candidate.personalizationPenalty ?? 0))));
        return {
          ...candidate,
          focusMatchScore:
            normalizeScore(
              focusMatchScore
            ),
          elsewhereScore,
        };
      }
    );

  ranked.sort((a, b) => {
    if(selected.length>0&&b.focusMatchScore!==a.focusMatchScore)return b.focusMatchScore-a.focusMatchScore;
    /*
     * Closest should genuinely prioritize
     * proximity after maintaining relevance.
     */
    if (
      preference === "closest"
    ) {
      const scoreDifference =
        b.elsewhereScore -
        a.elsewhereScore;

      if (
        Math.abs(
          scoreDifference
        ) > 5
      ) {
        return scoreDifference;
      }

      return (
        (a.distance ??
          Infinity) -
        (b.distance ??
          Infinity)
      );
    }

    if (
      b.elsewhereScore !==
      a.elsewhereScore
    ) {
      return (
        b.elsewhereScore -
        a.elsewhereScore
      );
    }

    if (
      selected.length > 0 &&
      b.focusMatchScore !==
        a.focusMatchScore
    ) {
      return (
        b.focusMatchScore -
        a.focusMatchScore
      );
    }

    if ((b.personalizationTieBreak ?? 0) !== (a.personalizationTieBreak ?? 0)) return (b.personalizationTieBreak ?? 0) - (a.personalizationTieBreak ?? 0);

    if (
      a.distance !==
      b.distance
    ) {
      return (
        (a.distance ??
          Infinity) -
        (b.distance ??
          Infinity)
      );
    }

    return (
      (a.placeId ?? "")
        .localeCompare(
          b.placeId ?? ""
        )
    );
  });

  /*
   * The UI displays the best matches.
   * candidateCount is handled separately by
   * the API and is NOT this number.
   */
  return ranked;
}