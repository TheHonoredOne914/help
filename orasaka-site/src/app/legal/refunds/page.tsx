import type { Metadata } from "next";
import { LegalDraft } from "@/components/legal-draft";
import { legalDocs } from "@/config/legal";

const doc = legalDocs.refunds;

export const metadata: Metadata = { title: `${doc.title} (черновик)` };

export default function Page() {
  return <LegalDraft title={doc.title} sections={[...doc.sections]} />;
}
