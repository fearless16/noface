import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const outputPath = path.join(workspaceRoot, "packages/shared/src/demo-confessions.generated.ts");

const FEED_SIZE = 1000;
const SEED_VERSION = `demo-feed-v2-${FEED_SIZE}`;
const MAX_TEXT_LENGTH = 480;
const baseTimestamp = Date.parse("2026-04-26T23:59:00.000Z");

const moods = ["sad", "angry", "regret", "happy", "anxious", "hopeful", null];
const shortLeads = [
  "I keep deleting messages before anyone can read how nervous I am.",
  "Today I lied and said I was fine because it was easier.",
  "I looked calm on the call while my hands would not stop shaking.",
  "I miss a version of me that slept without rehearsing tomorrow.",
  "I smiled through the room and counted the minutes until I could leave.",
  "I keep saying yes when I mean not tonight, not again, not now."
];
const mediumLeads = [
  "I keep promising myself that tomorrow will be the day I stop pretending this pace is sustainable, but then the morning arrives and I put the same face back on.",
  "There is a version of this week where I admit I am overwhelmed instead of acting efficient, composed, and somehow grateful for the pressure that is flattening me.",
  "No one noticed how long I sat in the car before going inside, trying to lower my heartbeat enough to sound normal when someone asked how the day went.",
  "I thought distance would make the memory smaller, but it still arrives with perfect detail and rearranges the rest of the night around it."
];
const longLeads = [
  "I keep replaying the same ordinary conversation because that was the moment I understood how much of my life is spent protecting other people from the truth that I am tired, frightened, and no longer convinced that endurance is the same thing as strength.",
  "The strangest part of carrying too much is how fluent I have become at looking untroubled, how quickly I can answer emails, make small talk, and hold eye contact while another part of me is already planning the safest place to disappear for ten quiet minutes.",
  "I wanted this season of life so badly that I feel guilty admitting how lonely it became once it finally arrived, and every time someone congratulates me I nod along instead of saying the version of success I imagined was never supposed to feel this cold."
];
const details = [
  "I am still trying to act like momentum and meaning are the same thing.",
  "Nobody around me can tell how much energy the performance costs.",
  "I keep waiting for clarity to arrive like a message instead of a decision.",
  "It would be easier to explain if I were angry, but most days I am just depleted.",
  "The silence after everyone leaves is the only part of the day that feels honest.",
  "I know this is not the worst thing anyone has carried, but it is the one that keeps me awake."
];
const closers = [
  "I just needed somewhere faceless to say it plainly.",
  "Maybe admitting it here is the first useful thing I have done with it.",
  "I want one night where the truth does not have to be disguised as composure.",
  "I am not asking for answers; I only wanted the weight outside my head for a minute.",
  "That is the sentence I could not say out loud anywhere else."
];

function buildUserId(index) {
  return `seed-user-${String((index % 240) + 1).padStart(3, "0")}`;
}

function pickLead(index, targetLength) {
  if (targetLength < 140) {
    return shortLeads[index % shortLeads.length];
  }

  if (targetLength < 220) {
    return mediumLeads[index % mediumLeads.length];
  }

  return longLeads[index % longLeads.length];
}

function pickFittingCloser(text, startIndex, maxLength) {
  for (let offset = 0; offset < closers.length; offset += 1) {
    const closer = closers[(startIndex + offset) % closers.length];

    if (`${text} ${closer}`.length <= maxLength) {
      return closer;
    }
  }

  return null;
}

function buildText(index) {
  const band = index % 3;
  const targetLength = band === 0 ? 95 + (index % 30) : band === 1 ? 150 + (index % 45) : 250 + (index % 150);
  let text = pickLead(index, targetLength);
  const maxLength = Math.min(Math.max(targetLength, text.length), MAX_TEXT_LENGTH);
  let detailIndex = index;
  const closerIndex = index % closers.length;

  while (detailIndex < index + details.length) {
    const nextDetail = details[detailIndex % details.length];
    const nextText = `${text} ${nextDetail}`;
    const closer = pickFittingCloser(nextText, closerIndex, maxLength);

    if (nextText.length > maxLength || !closer) {
      break;
    }

    text = nextText;
    detailIndex += 1;
  }

  const closer = pickFittingCloser(text, closerIndex, maxLength);

  if (closer) {
    return `${text} ${closer}`;
  }

  return text;
}

function buildConfession(index) {
  return {
    id: `demo-${String(index + 1).padStart(4, "0")}`,
    userId: buildUserId(index),
    text: buildText(index),
    mood: moods[index % moods.length],
    isPrivate: false,
    createdAt: new Date(baseTimestamp - index * 1000 * 60 * 11).toISOString(),
    source: "local"
  };
}

const confessions = Array.from({ length: FEED_SIZE }, (_, index) => buildConfession(index));
const fileContents = `/* eslint-disable */\nexport const GENERATED_DEMO_CONFESSION_SEED_VERSION = ${JSON.stringify(SEED_VERSION)};\n\nexport const GENERATED_DEMO_CONFESSIONS = ${JSON.stringify(confessions, null, 2)};\n`;

mkdirSync(path.dirname(outputPath), { recursive: true });

let previous = null;

try {
  previous = readFileSync(outputPath, "utf8");
} catch {
  previous = null;
}

if (previous !== fileContents) {
  writeFileSync(outputPath, fileContents);
}

console.log(`Prepared ${confessions.length} demo confessions in ${path.relative(workspaceRoot, outputPath)}.`);