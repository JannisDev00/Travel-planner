const fs = require("fs");
const path = require("path");
const { estimateFlight } = require("./flights");

const destinations = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "destinations.json"), "utf8")
);

function ageGroup(age) {
  if (age < 18) return "young";
  if (age <= 30) return "young";
  if (age <= 60) return "adult";
  return "senior";
}

function budgetTierFromDaily(dailyUSD) {
  if (dailyUSD < 70) return "low";
  if (dailyUSD < 160) return "medium";
  return "high";
}

function scoreDestination(dest, input) {
  let score = 0;
  const reasons = [];

  const matchedInterests = dest.tags.filter((t) => input.interests.includes(t));
  score += matchedInterests.length * 10;
  if (matchedInterests.length) {
    reasons.push(`Matches your interests: ${matchedInterests.join(", ")}`);
  }

  if (input.length >= dest.idealLengthMin && input.length <= dest.idealLengthMax) {
    score += 8;
    reasons.push(`Good fit for a ${input.length}-day trip`);
  } else {
    const distance = Math.min(
      Math.abs(input.length - dest.idealLengthMin),
      Math.abs(input.length - dest.idealLengthMax)
    );
    score -= distance;
  }

  const dailyBudget = input.budgetUSD / input.length;
  const destTier = budgetTierFromDaily(dest.avgDailyCostUSD);
  const userTier = budgetTierFromDaily(dailyBudget);
  if (destTier === userTier) {
    score += 10;
    reasons.push(`Matches your budget level (~$${Math.round(dailyBudget)}/day)`);
  } else if (
    (userTier === "high" && destTier !== "high") ||
    (userTier === "medium" && destTier === "low")
  ) {
    score += 4;
  } else {
    score -= 6;
  }

  const group = ageGroup(input.age);
  if (dest.ageSuitability.includes(group)) {
    score += 5;
  }

  return { score, reasons };
}

function buildItinerary(dest, input) {
  const activityPool = {
    beach: ["Relax on the beach and swim", "Beach-hop and try local seafood nearby"],
    relaxation: ["Spa or wellness session", "Slow morning, no fixed plans"],
    culture: ["Explore the old town and local neighborhoods", "Visit a major museum or gallery"],
    history: ["Visit historical landmarks", "Guided history walking tour"],
    food: ["Street food crawl", "Cooking class or food market visit"],
    nightlife: ["Evening out at local bars/clubs", "Sunset drinks followed by live music"],
    adventure: ["Day hike or outdoor adventure activity", "Try a local adrenaline activity (zipline, rafting, etc.)"],
    nature: ["Visit a nearby nature reserve or park", "Scenic countryside day trip"],
    wildlife: ["Wildlife spotting excursion", "Guided nature/wildlife tour"],
    shopping: ["Browse local markets and shops", "Free time for souvenir shopping"],
  };

  const chosenTags = dest.tags.filter((t) => input.interests.includes(t));
  const pool = (chosenTags.length ? chosenTags : dest.tags).flatMap((t) => activityPool[t] || []);
  const fallback = ["Free day to explore at your own pace", "Local recommendation: ask your accommodation for a hidden gem nearby"];
  const activities = pool.length ? pool : fallback;

  const days = [];
  for (let i = 1; i <= input.length; i++) {
    if (i === 1) {
      days.push({ day: i, plan: "Arrive, check in, and take it easy — short walk nearby to get oriented." });
    } else if (i === input.length) {
      days.push({ day: i, plan: "Final souvenirs/relaxation, then departure." });
    } else {
      const activity = activities[(i - 2) % activities.length];
      days.push({ day: i, plan: activity });
    }
  }
  return days;
}

function generatePlans(input) {
  const scored = destinations
    .map((dest) => ({ dest, ...scoreDestination(dest, input) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ dest, score, reasons }) => ({
    destination: dest.name,
    country: dest.country,
    description: dest.description,
    matchScore: score,
    reasons,
    estimatedDailyCostUSD: dest.avgDailyCostUSD,
    estimatedTotalCostUSD: dest.avgDailyCostUSD * input.length,
    itinerary: buildItinerary(dest, input),
    flight: estimateFlight(input.originCity, dest),
  }));
}

module.exports = { generatePlans, budgetTierFromDaily };
