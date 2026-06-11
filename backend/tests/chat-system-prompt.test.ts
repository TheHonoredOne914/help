import test from "node:test";
import assert from "node:assert/strict";

import {
  buildArchiveContextPrompt,
  composeAnthropicSystemPrompt,
} from "../src/lib/chat-system-prompt.ts";

test("buildArchiveContextPrompt includes topic and distilled facts", () => {
  const prompt = buildArchiveContextPrompt(
    "UNSC reform",
    "- India supports expanded representation\n- Veto reform remains contested",
  );

  assert.match(prompt, /Active archive topic: UNSC reform/);
  assert.match(prompt, /Archive distilled facts:/);
  assert.match(prompt, /India supports expanded representation/);
});

test("composeAnthropicSystemPrompt appends custom instructions after archive context", () => {
  const prompt = composeAnthropicSystemPrompt({
    archiveTopic: "Disarmament",
    archiveSummary: "India has not ratified the CTBT.",
    userSystemPrompt: "Be concise and cite treaty names.",
  });

  assert.match(prompt, /Active archive topic: Disarmament/);
  assert.match(prompt, /India has not ratified the CTBT/);
  assert.match(prompt, /Be concise and cite treaty names\./);
  assert.equal(prompt.indexOf("Active archive topic"), 0);
});

test("composeAnthropicSystemPrompt shares archive context even without custom mode prompts", () => {
  const prompt = composeAnthropicSystemPrompt({
    archiveTopic: "Legal archive: AI governance",
    archiveSummary: "- DPDP Act affects data governance arguments",
    userSystemPrompt: "",
  });

  assert.match(prompt, /Active archive topic: Legal archive: AI governance/);
  assert.match(prompt, /Treat this archive topic as shared project context across chats/);
  assert.match(prompt, /DPDP Act affects data governance arguments/);
});

test("composeAnthropicSystemPrompt returns custom prompt unchanged when no archive context exists", () => {
  const prompt = composeAnthropicSystemPrompt({
    archiveTopic: "",
    archiveSummary: "",
    userSystemPrompt: "Only answer with bullet points.",
  });

  assert.equal(prompt, "Only answer with bullet points.");
});
