import {
  createJsonGenerator,
  InterpretationUnavailableError,
} from "../lib/gemini-json";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  calculateDistanceKm,
  normalizeKeywords,
  normalizeScore,
  rankCandidates,
} from "../lib/places-ranking";

import { GoogleGenAI } from "@google/genai";

type ElsewherePreference =
  | "local"
  | "hidden-gem"
  | "popular-worth-it"
  | "closest";

type PlaceClassification = {
  category: string;
  categoryFamily: string;
  experienceKeywords: string[];
};

type CandidatePlace = {
  candidateId: string;
  name: string;
  address: string;
  categories: string[];
  distance: number | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

type AiRecommendation = {
  candidateId: string;
  similarityScore: number;
  localScore: number;
  distinctivenessScore: number;
  chainLikelihood: number;
  popularityScore: number;
  keywordScores: Record<string, number>;
  whySimilar: string;
  whyTryInstead: string;
};

type InterpretedCandidate =
  CandidatePlace & {
    similarityScore: number;
    localScore: number;
    distinctivenessScore: number;
    chainLikelihood: number;
    popularityScore: number;
    keywordScores: Record<string, number>;
    whySimilar: string;
    whyTryInstead: string;
  };

type SearchSnapshot = {
  place: string;
  expiresAt: number;
  searchedPlace: {
    name: string;
    formatted: string;
    city: string;
    country: string;
    latitude: number | null;
    longitude: number | null;
    placeId: string | null;
  };
  classification: PlaceClassification;
  candidates: InterpretedCandidate[];
};

const CATEGORY_MAP: Record<string, string[]> = {
  bakery_pastry: [
    "commercial.food_and_drink.bakery",
    "commercial.food_and_drink",
    "catering.cafe",
  ],

  cafe: [
    "catering.cafe",
    "commercial.food_and_drink",
  ],

  restaurant: [
    "catering.restaurant",
  ],

  food_general: [
    "commercial.food_and_drink",
    "catering",
  ],

  art_design: [
    "commercial.art",
    "commercial",
    "tourism.attraction.artwork",
  ],

  books: [
    "commercial.books",
  ],

  antiques_vintage: [
    "commercial.antiques",
    "commercial",
  ],

  fashion: [
    "commercial.clothing",
    "commercial",
  ],

  shopping_gifts: [
    "commercial",
  ],

  market: [
    "commercial",
  ],

  museum_culture: [
    "entertainment.museum",
    "entertainment",
    "tourism",
  ],

  viewpoint: [
    "tourism.attraction.viewpoint",
    "tourism.attraction",
  ],

  attraction: [
    "tourism.attraction",
    "tourism",
  ],

  general: [
    "commercial",
    "catering",
    "tourism",
    "entertainment",
  ],
};

const ALLOWED_PREFERENCES: ElsewherePreference[] = [
  "local",
  "hidden-gem",
  "popular-worth-it",
  "closest",
];

function signSnapshot(
  snapshot: SearchSnapshot,
  secret: string
): string {
  const payload =
    Buffer.from(
      JSON.stringify(snapshot)
    ).toString("base64url");

  const signature =
    createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");

  return `${payload}.${signature}`;
}

function readSnapshot(
  token: unknown,
  secret: string
): SearchSnapshot | null {
  if (
    typeof token !== "string" ||
    token.length > 1_000_000
  ) {
    return null;
  }

  const [
    payload,
    signature,
    extra,
  ] = token.split(".");

  if (
    !payload ||
    !signature ||
    extra
  ) {
    return null;
  }

  const expected =
    createHmac("sha256", secret)
      .update(payload)
      .digest();

  const actual =
    Buffer.from(
      signature,
      "base64url"
    );

  if (
    actual.length !==
      expected.length ||
    !timingSafeEqual(
      actual,
      expected
    )
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        Buffer.from(
          payload,
          "base64url"
        ).toString("utf8")
      );

    return parsed as SearchSnapshot;
  } catch {
    return null;
  }
}

function normalizeName(
  name: string
): string {
  return name
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(
      /[^\p{L}\p{N}]/gu,
      ""
    );
}

function normalizeRequestedKeywords(
  keywords: unknown,
  classification: PlaceClassification
): string[] {
  const requested =
    normalizeKeywords(keywords);

  const canonical =
    classification
      .experienceKeywords;

  return requested
    .map((keyword) =>
      canonical.find(
        (item) =>
          item.toLowerCase() ===
          keyword.toLowerCase()
      )
    )
    .filter(
      (
        keyword
      ): keyword is string =>
        Boolean(keyword)
    );
}

function searchResponse(
  searchId: string,
  snapshot: SearchSnapshot,
  preference: ElsewherePreference,
  keywords: string[],
  distanceKm: number | null
) {
  const selectedKeywords =
    normalizeRequestedKeywords(
      keywords,
      snapshot.classification
    );

  const eligibleCandidates =
    snapshot.candidates.filter(
      (candidate) => {
        if (distanceKm === null) {
          return true;
        }

        return (
          candidate.distance !==
            null &&
          candidate.distance <=
            distanceKm
        );
      }
    );

  const recommendations =
    rankCandidates(
      snapshot.candidates,
      preference,
      selectedKeywords,
      distanceKm
    );

  return Response.json({
    success: true,
    searchId,
    searchedPlace:
      snapshot.searchedPlace,
    classification:
      snapshot.classification,
    preference,
    selectedKeywords,
    distanceKm,
    candidateCount:
      eligibleCandidates.length,
    recommendations,
  });
}

async function fetchJson(
  url: string,
  requestSignal: AbortSignal
) {
  const response =
    await fetch(url, {
      signal: AbortSignal.any([
        requestSignal,
        AbortSignal.timeout(
          30_000
        ),
      ]),
    });

  if (!response.ok) {
    throw new Error(
      `Request failed with status ${response.status}.`
    );
  }

  return response.json();
}

function featureToCandidate(
  feature: any,
  searchedLatitude: number,
  searchedLongitude: number
) {
  const properties =
    feature?.properties ?? {};

  const coordinates =
    feature?.geometry
      ?.coordinates ?? [];

  const longitude =
    typeof coordinates[0] ===
    "number"
      ? coordinates[0]
      : null;

  const latitude =
    typeof coordinates[1] ===
    "number"
      ? coordinates[1]
      : null;

  let distance:
    | number
    | null = null;

  if (
    latitude !== null &&
    longitude !== null
  ) {
    distance =
      calculateDistanceKm(
        searchedLatitude,
        searchedLongitude,
        latitude,
        longitude
      );
  }

  return {
    name:
      properties.name ||
      properties.address_line1 ||
      "Unnamed place",

    address:
      properties.formatted ||
      "",

    categories:
      Array.isArray(
        properties.categories
      )
        ? properties.categories
        : [],

    distance,
    latitude,
    longitude,

    placeId:
      properties.place_id ??
      null,
  };
}

/*
 * We intentionally perform separate category searches instead
 * of one broad proximity-biased request.
 *
 * This gives narrower relevant categories their own chance to
 * contribute candidates before broader fallback categories do.
 */
async function discoverCityCandidates({
  cityPlaceId,
  categories,
  searchedLatitude,
  searchedLongitude,
  searchedPlaceId,
  searchedPlaceName,
  originalQuery,
  geoapifyApiKey,
  requestSignal,
}: {
  cityPlaceId: string;
  categories: string[];
  searchedLatitude: number;
  searchedLongitude: number;
  searchedPlaceId: string | null;
  searchedPlaceName: string;
  originalQuery: string;
  geoapifyApiKey: string;
  requestSignal: AbortSignal;
}) {
  const uniqueCategories =
    Array.from(
      new Set(categories)
    );

  const discovered: any[] =
    [];

  /*
   * Geoapify limits the number returned by a single Places
   * request. Instead of one mixed category request, query each
   * relevant category separately across the city boundary.
   *
   * There is deliberately NO proximity bias here.
   */
  for (
    const category of
      uniqueCategories
  ) {
    const url =
      `https://api.geoapify.com/v2/places` +
      `?categories=${encodeURIComponent(
        category
      )}` +
      `&filter=${encodeURIComponent(
        `place:${cityPlaceId}`
      )}` +
      `&limit=100` +
      `&apiKey=${geoapifyApiKey}`;

    const data =
      await fetchJson(
        url,
        requestSignal
      );

    const features =
      Array.isArray(
        data?.features
      )
        ? data.features
        : [];

    for (
      const feature of features
    ) {
      discovered.push(
        featureToCandidate(
          feature,
          searchedLatitude,
          searchedLongitude
        )
      );
    }
  }

  const originalNames =
    new Set(
      [
        searchedPlaceName,
        originalQuery.split(",")[0],
      ]
        .filter(Boolean)
        .map(normalizeName)
    );

  const seenPlaceIds =
    new Set<string>();

  const seenFallbackKeys =
    new Set<string>();

  const candidates =
    discovered.filter(
      (candidate) => {
        if (
          candidate.name ===
          "Unnamed place"
        ) {
          return false;
        }

        /*
         * Prefer Geoapify place_id for deduplication.
         */
        if (candidate.placeId) {
          if (
            candidate.placeId ===
            searchedPlaceId
          ) {
            return false;
          }

          if (
            seenPlaceIds.has(
              candidate.placeId
            )
          ) {
            return false;
          }
        }

        /*
         * Geocoding and Places can occasionally represent the
         * original venue with different place IDs.
         */
        if (
          candidate.distance !==
            null &&
          candidate.distance <=
            0.15 &&
          originalNames.has(
            normalizeName(
              candidate.name
            )
          )
        ) {
          return false;
        }

        /*
         * Also protect against duplicates that appear in more
         * than one category response with different IDs.
         */
        const fallbackKey =
          `${normalizeName(
            candidate.name
          )}|${normalizeName(
            candidate.address
          )}`;

        if (
          seenFallbackKeys.has(
            fallbackKey
          )
        ) {
          return false;
        }

        if (candidate.placeId) {
          seenPlaceIds.add(
            candidate.placeId
          );
        }

        seenFallbackKeys.add(
          fallbackKey
        );

        return true;
      }
    );

  return candidates.map(
    (
      candidate,
      index
    ): CandidatePlace => ({
      ...candidate,
      candidateId:
        `candidate-${index}`,
    })
  );
}

export async function POST(
  request: Request
) {
  try {
    const geoapifyApiKey =
      process.env
        .GEOAPIFY_API_KEY;

    const geminiApiKey =
      process.env
        .GEMINI_API_KEY;

    if (
      !geoapifyApiKey ||
      !geminiApiKey
    ) {
      return Response.json(
        {
          success: false,
          error:
            "API configuration is missing.",
        },
        {
          status: 500,
        }
      );
    }

    const body =
      await request.json();

    const place =
      typeof body?.place ===
        "string"
        ? body.place.trim()
        : "";

    if (!place) {
      return Response.json(
        {
          success: false,
          error:
            "A place name is required.",
        },
        {
          status: 400,
        }
      );
    }

    const requestedPreference =
      typeof body
        ?.preference ===
        "string"
        ? body.preference
        : "local";

    const preference:
      ElsewherePreference =
      ALLOWED_PREFERENCES.includes(
        requestedPreference as ElsewherePreference
      )
        ? requestedPreference as ElsewherePreference
        : "local";

    const requestedKeywords =
      normalizeKeywords(
        body?.selectedKeywords
      );

    const rawDistance =
      body?.distanceKm;

    let distanceKm:
      | number
      | null = null;

    if (
      rawDistance !== null &&
      rawDistance !==
        undefined &&
      rawDistance !== "all"
    ) {
      const parsedDistance =
        Number(rawDistance);

      if (
        [1, 2, 5].includes(
          parsedDistance
        )
      ) {
        distanceKm =
          parsedDistance;
      }
    }

    /*
     * FILTER UPDATE
     *
     * A valid searchId means the expensive discovery and Gemini
     * interpretation have already happened.
     *
     * We simply rerank the SAME city candidate universe using
     * the user's new controls.
     */
    if (body?.searchId) {
      const snapshot =
        readSnapshot(
          body.searchId,
          geminiApiKey
        );

      if (
        !snapshot ||
        snapshot.place !==
          place ||
        snapshot.expiresAt <=
          Date.now()
      ) {
        return Response.json(
          {
            success: false,
            error:
              "This search expired. Start a new search to refresh the places.",
          },
          {
            status: 410,
          }
        );
      }

      return searchResponse(
        body.searchId,
        snapshot,
        preference,
        requestedKeywords,
        distanceKm
      );
    }

    const ai =
      new GoogleGenAI({
        apiKey: geminiApiKey,
      });

    /*
     * --------------------------------
     * 1. FIND ORIGINAL PLACE
     * --------------------------------
     */

    const geocodeUrl =
      `https://api.geoapify.com/v1/geocode/search` +
      `?text=${encodeURIComponent(
        place
      )}` +
      `&limit=1` +
      `&format=geojson` +
      `&apiKey=${geoapifyApiKey}`;

    const geocodeData =
      await fetchJson(
        geocodeUrl,
        request.signal
      );

    const originalFeature =
      geocodeData
        ?.features?.[0];

    if (!originalFeature) {
      return Response.json(
        {
          success: false,
          error:
            "Place not found.",
        },
        {
          status: 404,
        }
      );
    }

    const originalProperties =
      originalFeature
        .properties ?? {};

    const originalCoordinates =
      originalFeature
        .geometry
        ?.coordinates ?? [];

    const searchedPlace = {
      name:
        originalProperties.name ||
        place,

      formatted:
        originalProperties
          .formatted ||
        place,

      city:
        originalProperties.city ||
        originalProperties.town ||
        originalProperties
          .village ||
        originalProperties
          .county ||
        "",

      country:
        originalProperties
          .country ||
        "",

      latitude:
        typeof originalCoordinates[
          1
        ] === "number"
          ? originalCoordinates[1]
          : null,

      longitude:
        typeof originalCoordinates[
          0
        ] === "number"
          ? originalCoordinates[0]
          : null,

      placeId:
        originalProperties
          .place_id ??
        null,
    };

    if (
      searchedPlace.latitude ===
        null ||
      searchedPlace.longitude ===
        null
    ) {
      throw new Error(
        "Coordinates were missing."
      );
    }

    /*
     * --------------------------------
     * 2. UNDERSTAND EXPERIENCE
     * --------------------------------
     */

    const classificationPrompt = `
You are the experience-understanding system for a travel discovery app called Elsewhere.

A traveler searches for a real place.

Your job is NOT merely to identify its business category.

Understand the experiences, products, styles, characteristics, and reasons someone could want to visit this specific place.

The experience keywords become CLICKABLE FILTERS in the app.

They must therefore describe meaningful parts of the experience that a traveler could intentionally preserve when looking for an alternative.

Examples only:

Pastry shop:
- sculptural pastries
- viennoiserie
- artistic desserts
- French pâtisserie

Vintage store:
- designer vintage
- curated fashion
- rare accessories
- retro clothing

Viewpoint:
- skyline views
- sunset
- photography
- panoramic scenery

Bookstore:
- independent books
- art books
- literary atmosphere
- rare editions

Generate terms appropriate to the ACTUAL searched place.

SEARCHED PLACE

Name:
"${searchedPlace.name}"

Address:
"${searchedPlace.formatted}"

Choose exactly ONE categoryFamily from:

bakery_pastry
cafe
restaurant
food_general
art_design
books
antiques_vintage
fashion
shopping_gifts
market
museum_culture
viewpoint
attraction
general

Return ONLY valid JSON:

{
  "category": "short human-readable description",
  "categoryFamily": "one exact allowed value",
  "experienceKeywords": [
    "short selectable experience",
    "short selectable experience",
    "short selectable experience",
    "short selectable experience"
  ]
}

Requirements:

- Return 4 or 5 experienceKeywords.
- Make each keyword meaningfully different.
- Keep each keyword concise.
- Do not include the searched business name.
- Do not invent ratings.
- Do not invent prices.
- Do not invent wait times.
- Do not invent awards.
`;

    const generateJson =
      createJsonGenerator(
        ai,
        request.signal
      );

    const rawClassification =
      await generateJson(
        classificationPrompt,
        {
          type: "object",

          properties: {
            category: {
              type: "string",
            },

            categoryFamily: {
              type: "string",
              enum:
                Object.keys(
                  CATEGORY_MAP
                ),
            },

            experienceKeywords: {
              type: "array",
              items: {
                type: "string",
              },
              minItems: 4,
              maxItems: 5,
            },
          },

          required: [
            "category",
            "categoryFamily",
            "experienceKeywords",
          ],
        },
        (data) => {
          if (
            !data ||
            typeof data.category !==
              "string" ||
            !Object.hasOwn(
              CATEGORY_MAP,
              data.categoryFamily
            ) ||
            !normalizeKeywords(
              data.experienceKeywords
            ).length
          ) {
            throw new Error(
              "Gemini classification was incomplete."
            );
          }

          return data as PlaceClassification;
        }
      );

    const requestedFamily =
      typeof rawClassification
        ?.categoryFamily ===
        "string"
        ? rawClassification
            .categoryFamily
        : "general";

    const categoryFamily =
      CATEGORY_MAP[
        requestedFamily
      ]
        ? requestedFamily
        : "general";

    const classification:
      PlaceClassification = {
      category:
        typeof rawClassification
          ?.category ===
          "string"
          ? rawClassification
              .category
          : categoryFamily,

      categoryFamily,

      experienceKeywords:
        normalizeKeywords(
          rawClassification
            ?.experienceKeywords
        ),
    };

    /*
     * --------------------------------
     * 3. RESOLVE CITY BOUNDARY
     * --------------------------------
     */

    const cityQuery =
      [
        searchedPlace.city,
        searchedPlace.country,
      ]
        .filter(Boolean)
        .join(", ");

    let cityPlaceId:
      | string
      | null = null;

    if (cityQuery) {
      const cityGeocodeUrl =
        `https://api.geoapify.com/v1/geocode/search` +
        `?text=${encodeURIComponent(
          cityQuery
        )}` +
        `&type=city` +
        `&limit=1` +
        `&format=geojson` +
        `&apiKey=${geoapifyApiKey}`;

      const cityData =
        await fetchJson(
          cityGeocodeUrl,
          request.signal
        );

      cityPlaceId =
        cityData
          ?.features?.[0]
          ?.properties
          ?.place_id ??
        null;
    }

    if (!cityPlaceId) {
      throw new Error(
        "Could not resolve the city boundary for this place."
      );
    }

    /*
     * --------------------------------
     * 4. DISCOVER REAL CITY PLACES
     * --------------------------------
     *
     * IMPORTANT:
     *
     * There is NO proximity bias here.
     *
     * Each relevant Geoapify category gets its own city-wide
     * request. Results are then merged and deduplicated.
     *
     * This removes the old behavior where "All city" was
     * secretly just one proximity-biased group of <=100 places.
     */

    const discoveryCategories =
      CATEGORY_MAP[
        categoryFamily
      ];

    const candidates =
      await discoverCityCandidates({
        cityPlaceId,

        categories:
          discoveryCategories,

        searchedLatitude:
          searchedPlace.latitude,

        searchedLongitude:
          searchedPlace.longitude,

        searchedPlaceId:
          searchedPlace.placeId,

        searchedPlaceName:
          searchedPlace.name,

        originalQuery:
          place,

        geoapifyApiKey,

        requestSignal:
          request.signal,
      });

    if (
      candidates.length === 0
    ) {
      return Response.json({
        success: true,
        searchedPlace,
        classification,
        preference,
        selectedKeywords:
          requestedKeywords,
        distanceKm,
        candidateCount: 0,
        recommendations: [],
      });
    }

    /*
     * --------------------------------
     * 5. SEMANTIC INTERPRETATION
     * --------------------------------
     *
     * Gemini scores each candidate independently of the user's
     * current filters.
     *
     * That is critical:
     * clicking a chip later does NOT regenerate the chips or
     * reinterpret the original venue.
     */

    function rankingPrompt(
      batch: CandidatePlace[]
    ) {
      return `
You are the semantic interpretation system for a travel discovery app called Elsewhere.

Elsewhere helps travelers find REAL alternatives to famous, viral, obvious, crowded, touristy, or highly promoted places.

Every candidate below already comes from Geoapify.

DO NOT invent places.

ORIGINAL PLACE:

"${searchedPlace.name}"

GENERAL TYPE:

"${classification.category}"

ORIGINAL EXPERIENCE DIMENSIONS:

${JSON.stringify(
  classification
    .experienceKeywords
)}

Score candidates independently of the traveler's currently selected filters.

The deterministic Elsewhere ranking algorithm will apply Local, Hidden gem, Popular but worth it, Closest, experience-chip selections, and distance filters AFTER your interpretation.

SCORING DEFINITIONS

similarityScore:
How strongly the candidate's overall purpose, product, style, and experience match the original place.

keywordScores:
One score for EACH original experience dimension, in EXACTLY the same order shown above.

localScore:
How strongly the candidate appears independent, artisan, neighborhood-oriented, locally distinctive, or rooted in the city.

distinctivenessScore:
How specialized, memorable, creative, unusual, or distinctive the candidate appears.

chainLikelihood:
How likely it appears to be a large chain, major standardized brand, department store, or highly standardized multi-location business.

popularityScore:
How mainstream, famous, destination-like, obvious, or widely known it appears.

IMPORTANT:

These are interpretation signals, not verified statistics.

Do not claim access to live ratings, review counts, queues, prices, visitor counts, or popularity statistics.

REAL CANDIDATES:

${JSON.stringify(
  batch.map(
    (candidate) => ({
      candidateId:
        candidate.candidateId,

      name:
        candidate.name,

      address:
        candidate.address,

      categories:
        candidate.categories,

      distanceKm:
        candidate.distance,
    })
  ),
  null,
  2
)}

Evaluate EVERY supplied candidate exactly once.

Do not shortlist them.

Weak matches should still be returned with appropriately low scores.

Return ONLY valid JSON:

{
  "recommendations": [
    {
      "candidateId": "candidate-0",
      "similarityScore": 0,
      "keywordScores": ${JSON.stringify(
        classification
          .experienceKeywords
          .map(() => 0)
      )},
      "localScore": 0,
      "distinctivenessScore": 0,
      "chainLikelihood": 0,
      "popularityScore": 0,
      "whySimilar": "short explanation",
      "whyTryInstead": "short explanation"
    }
  ]
}

Rules:

- candidateId must exactly match a supplied candidate.
- Return every candidate exactly once.
- keywordScores must contain exactly one integer 0-100 for each original experience dimension, in the same order.
- All scores must be integers from 0 to 100.
- Never invent a candidate.
- Never invent a business name.
- Never invent ratings.
- Never invent prices.
- Never invent wait times.
- Never invent awards.
`;
    }

    const aiRecommendations:
      AiRecommendation[] = [];

    const scoreSchema = {
      type: "integer",
      minimum: 0,
      maximum: 100,
    };

    const scoreFields = [
      "similarityScore",
      "localScore",
      "distinctivenessScore",
      "chainLikelihood",
      "popularityScore",
    ] as const;

    /*
     * Keep batches moderate so one model call does not contain
     * the entire city candidate pool.
     */
    const BATCH_SIZE = 20;

    for (
      let offset = 0;
      offset <
      candidates.length;
      offset += BATCH_SIZE
    ) {
      const batch =
        candidates.slice(
          offset,
          offset + BATCH_SIZE
        );

      const results =
        await generateJson(
          rankingPrompt(batch),
          {
            type: "object",

            properties: {
              recommendations: {
                type: "array",

                items: {
                  type: "object",

                  properties: {
                    candidateId: {
                      type: "string",
                    },

                    ...Object.fromEntries(
                      scoreFields.map(
                        (field) => [
                          field,
                          scoreSchema,
                        ]
                      )
                    ),

                    keywordScores: {
                      type: "array",
                      items:
                        scoreSchema,
                    },

                    whySimilar: {
                      type: "string",
                    },

                    whyTryInstead: {
                      type: "string",
                    },
                  },

                  required: [
                    "candidateId",
                    ...scoreFields,
                    "keywordScores",
                    "whySimilar",
                    "whyTryInstead",
                  ],
                },
              },
            },

            required: [
              "recommendations",
            ],
          },

          (data) => {
            if (
              !Array.isArray(
                data?.recommendations
              )
            ) {
              throw new Error(
                "Gemini interpretations were missing."
              );
            }

            const byId =
              new Map<
                string,
                AiRecommendation
              >();

            for (
              const rawItem of
                data.recommendations
            ) {
              if (
                !rawItem ||
                !batch.some(
                  (candidate) =>
                    candidate
                      .candidateId ===
                    rawItem
                      .candidateId
                )
              ) {
                continue;
              }

              if (
                byId.has(
                  rawItem.candidateId
                )
              ) {
                throw new Error(
                  "Gemini repeated a candidate."
                );
              }

              if (
                !Array.isArray(
                  rawItem
                    .keywordScores
                ) ||
                rawItem
                  .keywordScores
                  .length !==
                  classification
                    .experienceKeywords
                    .length
              ) {
                throw new Error(
                  "Gemini omitted an experience score."
                );
              }

              const keywordScores =
                Object.fromEntries(
                  classification
                    .experienceKeywords
                    .map(
                      (
                        keyword,
                        index
                      ) => [
                        keyword,
                        rawItem
                          .keywordScores[
                          index
                        ],
                      ]
                    )
                );

              const item: AiRecommendation =
                {
                  candidateId:
                    rawItem
                      .candidateId,

                  similarityScore:
                    rawItem
                      .similarityScore,

                  localScore:
                    rawItem
                      .localScore,

                  distinctivenessScore:
                    rawItem
                      .distinctivenessScore,

                  chainLikelihood:
                    rawItem
                      .chainLikelihood,

                  popularityScore:
                    rawItem
                      .popularityScore,

                  keywordScores,

                  whySimilar:
                    rawItem
                      .whySimilar,

                  whyTryInstead:
                    rawItem
                      .whyTryInstead,
                };

              const allScores = [
                item
                  .similarityScore,
                item.localScore,
                item
                  .distinctivenessScore,
                item
                  .chainLikelihood,
                item
                  .popularityScore,

                ...classification
                  .experienceKeywords
                  .map(
                    (keyword) =>
                      item
                        .keywordScores[
                        keyword
                      ]
                  ),
              ];

              if (
                allScores.some(
                  (value) =>
                    typeof value !==
                      "number" ||
                    !Number.isFinite(
                      value
                    ) ||
                    value < 0 ||
                    value > 100
                )
              ) {
                throw new Error(
                  "Gemini returned an invalid score."
                );
              }

              byId.set(
                item.candidateId,
                item
              );
            }

            return batch.map(
              (candidate) => {
                const item =
                  byId.get(
                    candidate
                      .candidateId
                  );

                if (!item) {
                  throw new Error(
                    "Gemini omitted a candidate."
                  );
                }

                return item;
              }
            );
          }
        );

      aiRecommendations.push(
        ...results
      );
    }

    /*
     * --------------------------------
     * 6. BUILD STABLE CANDIDATE SNAPSHOT
     * --------------------------------
     */

    const interpretations =
      new Map(
        aiRecommendations.map(
          (item) => [
            item.candidateId,
            item,
          ]
        )
      );

    const interpreted:
      InterpretedCandidate[] =
      candidates.map(
        (candidate) => {
          const interpretation =
            interpretations.get(
              candidate
                .candidateId
            );

          if (
            !interpretation
          ) {
            throw new Error(
              "Gemini omitted a candidate; please retry."
            );
          }

          const keywordScores =
            Object.fromEntries(
              classification
                .experienceKeywords
                .map(
                  (keyword) => [
                    keyword,
                    normalizeScore(
                      interpretation
                        .keywordScores[
                        keyword
                      ]
                    ),
                  ]
                )
            );

          return {
            ...candidate,

            keywordScores,

            similarityScore:
              normalizeScore(
                interpretation
                  .similarityScore
              ),

            localScore:
              normalizeScore(
                interpretation
                  .localScore
              ),

            distinctivenessScore:
              normalizeScore(
                interpretation
                  .distinctivenessScore
              ),

            chainLikelihood:
              normalizeScore(
                interpretation
                  .chainLikelihood
              ),

            popularityScore:
              normalizeScore(
                interpretation
                  .popularityScore
              ),

            whySimilar:
              typeof interpretation
                .whySimilar ===
                "string"
                ? interpretation
                    .whySimilar
                : "",

            whyTryInstead:
              typeof interpretation
                .whyTryInstead ===
                "string"
                ? interpretation
                    .whyTryInstead
                : "",
          };
        }
      );

    const snapshot:
      SearchSnapshot = {
      place,
      searchedPlace,
      classification,
      candidates:
        interpreted,
      expiresAt:
        Date.now() +
        30 * 60 * 1000,
    };

    const searchId =
      signSnapshot(
        snapshot,
        geminiApiKey
      );

    /*
     * Initial search:
     * Local + All city + no selected chip unless the browser
     * explicitly supplied something else.
     */
    return searchResponse(
      searchId,
      snapshot,
      preference,
      requestedKeywords,
      distanceKm
    );
  } catch (error) {
    console.error(
      "Places recommendation error:",
      error
    );

    return Response.json(
      {
        success: false,

        error:
          error instanceof
          InterpretationUnavailableError
            ? error.message
            : "Something went wrong while finding alternatives.",
      },
      {
        status:
          error instanceof
          InterpretationUnavailableError
            ? 503
            : 500,
      }
    );
  }
}