export type ElsewherePreference =
  | "local"
  | "hidden-gem"
  | "popular-worth-it"
  | "closest";

export type ElsewhereScores = {
  similarityScore: number;
  focusMatchScore: number;
  localScore: number;
  distinctivenessScore: number;
  chainLikelihood: number;
  popularityScore: number;
  distanceScore: number;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function calculateDistanceScore(
  distanceKm: number | null
): number {
  if (distanceKm === null) return 50;
  if (distanceKm <= 0.5) return 100;
  if (distanceKm <= 1) return 95;
  if (distanceKm <= 2) return 85;
  if (distanceKm <= 5) return 70;
  if (distanceKm <= 10) return 50;

  return 30;
}

export function calculateElsewhereScore({
  scores,
  preference = "local",
  hasSelectedFocus = false,
}: {
  scores: ElsewhereScores;
  preference?: ElsewherePreference;
  hasSelectedFocus?: boolean;
}): number {
  const {
    similarityScore,
    focusMatchScore,
    localScore,
    distinctivenessScore,
    chainLikelihood,
    popularityScore,
    distanceScore,
  } = scores;

  const focusWeight = hasSelectedFocus ? 0.2 : 0;
  const baseWeight = hasSelectedFocus ? 0.8 : 1;

  let baseScore = 0;

  if (preference === "local") {
    baseScore =
      similarityScore * 0.45 +
      localScore * 0.3 +
      distinctivenessScore * 0.15 +
      distanceScore * 0.1 -
      chainLikelihood * 0.18;
  }

  if (preference === "hidden-gem") {
    baseScore =
      similarityScore * 0.4 +
      localScore * 0.2 +
      distinctivenessScore * 0.3 +
      distanceScore * 0.1 -
      popularityScore * 0.15 -
      chainLikelihood * 0.15;
  }

  if (preference === "popular-worth-it") {
    baseScore =
      similarityScore * 0.55 +
      popularityScore * 0.2 +
      distinctivenessScore * 0.1 +
      localScore * 0.05 +
      distanceScore * 0.1 -
      chainLikelihood * 0.05;
  }

  if (preference === "closest") {
    baseScore =
      similarityScore * 0.4 +
      distanceScore * 0.4 +
      localScore * 0.1 +
      distinctivenessScore * 0.1 -
      chainLikelihood * 0.08;
  }

  const finalScore =
    focusMatchScore * focusWeight +
    baseScore * baseWeight;

  return Math.round(clampScore(finalScore));
}