import assert from "node:assert/strict";
import {
  createArchive,
  createConversation,
  getConversationById,
  getConversationsByArchiveId,
  listArchives,
  listConversations,
} from "../src/db.js";

const suffix = Date.now().toString(36);
const userA = `qa-user-a-${suffix}`;
const userB = `qa-user-b-${suffix}`;

const archiveA = await createArchive(`QA A ${suffix}`, "AIPPM account isolation A", userA);
const archiveB = await createArchive(`QA B ${suffix}`, "AIPPM account isolation B", userB);
const conversationA = await createConversation(archiveA.id, "Private A conversation", userA);
const conversationB = await createConversation(archiveB.id, "Private B conversation", userB);

const archivesA = await listArchives(userA);
const archivesB = await listArchives(userB);
const conversationsA = await listConversations(userA);
const conversationsB = await listConversations(userB);

assert.equal(archivesA.some((archive) => archive.id === archiveA.id), true);
assert.equal(archivesA.some((archive) => archive.id === archiveB.id), false);
assert.equal(archivesB.some((archive) => archive.id === archiveB.id), true);
assert.equal(archivesB.some((archive) => archive.id === archiveA.id), false);

assert.equal(conversationsA.some((conversation) => conversation.id === conversationA.id), true);
assert.equal(conversationsA.some((conversation) => conversation.id === conversationB.id), false);
assert.equal(conversationsB.some((conversation) => conversation.id === conversationB.id), true);
assert.equal(conversationsB.some((conversation) => conversation.id === conversationA.id), false);

assert.equal(await getConversationById(conversationA.id, userB), null);
assert.equal((await getConversationsByArchiveId(archiveA.id, userB)).length, 0);

console.log("user isolation smoke passed");
