import type { AgendaContract } from "../agenda/agenda-contract.js";
import { COUNCILLOR_ROLES, RETRIEVING_COUNCILLOR_IDS, roleForCouncillor } from "./council-config.js";
import type { CouncillorPlan, RetrievingCouncillorId } from "./council-types.js";

export function planCouncillors(userQuery: string, agendaContract: AgendaContract): CouncillorPlan[] {
  const subject = agendaContract.normalizedAgenda || userQuery.trim();
  return RETRIEVING_COUNCILLOR_IDS.map((id) => planForCouncillor(id, subject));
}

function planForCouncillor(id: RetrievingCouncillorId, subject: string): CouncillorPlan {
  const role = roleForCouncillor(id);
  if (!role) throw new Error(`Missing Council role for ${id}`);
  return {
    councillor_id: id,
    title: role.title,
    perspective: role.perspective,
    retrieval_focus: [...role.retrievalFocus],
    query_lens: `${subject}: ${role.perspective}`,
  };
}

export function getCouncilRoleDigest(): string {
  return COUNCILLOR_ROLES
    .map((role) => `${role.id}: ${role.title} - ${role.perspective}`)
    .join("\n");
}
