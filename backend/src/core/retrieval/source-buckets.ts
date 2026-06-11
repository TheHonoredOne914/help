import type { AgendaContract } from "../agenda/agenda-contract.js";

export type SourceBucketId =
  | "democracy_index"
  | "government_official"
  | "court_legal"
  | "human_rights_watchdog"
  | "civic_space"
  | "press_freedom"
  | "digital_rights"
  | "electoral_integrity"
  | "academic_research"
  | "indian_major_media"
  | "comparative_democracy"
  | "parliamentary_records"
  | "legal_commentary"
  | "policy_research";

export interface SourceBucketRequirement {
  bucketId: string;
  required: boolean;
}

export interface SourceBucket {
  id: SourceBucketId;
  label: string;
  purpose: string;
  minSources: number;
  idealSources: number;
  maxRawResults: number;
  preferredDomains: string[];
  acceptableDomains: string[];
  blockedDomains: string[];
  requiredForThesis: boolean;
  fullTextRequired: boolean;
  queryTemplates: string[];
  evidenceUse:
    | "primary_numbers"
    | "official_position"
    | "legal_holding"
    | "watchdog_assessment"
    | "academic_interpretation"
    | "journalistic_reporting"
    | "comparative_context"
    | "debate_utility";
}

export function getSourceBucketsForAgenda(contract: AgendaContract): SourceBucket[] {
  if (contract.topicType === "indian_democratic_space") return INDIAN_DEMOCRATIC_SPACE_BUCKETS;
  return uniqueBuckets(TOPIC_BUCKETS[contract.topicType] ?? GENERIC_INDIAN_BUCKETS);
}

export const INDIAN_DEMOCRATIC_SPACE_BUCKETS: SourceBucket[] = [
  bucket("democracy_index", "Democracy indices", 5, 8, ["freedomhouse.org", "v-dem.net", "eiu.com", "economist.com", "idea.int", "ourworldindata.org"], "primary_numbers", [
    "India Freedom in the World 2025 political rights civil liberties score",
    "India Freedom in the World 2024 Freedom House score",
    "India Freedom House 2023 freedom rating",
    "India Freedom House 2022 political rights civil liberties",
    "V-Dem Democracy Report 2025 India electoral autocracy liberal democracy index",
    "V-Dem Democracy Report 2024 India",
    "V-Dem India liberal democracy index 2022 2023 2024 2025",
    "EIU Democracy Index 2024 India score rank flawed democracy",
    "EIU Democracy Index 2023 India score rank",
    "International IDEA Global State of Democracy India 2024 2025",
  ]),
  bucket("government_official", "Government and official records", 5, 10, ["mha.gov.in", "fcraonline.nic.in", "eci.gov.in", "pib.gov.in", "egazette.nic.in", "sansad.in"], "official_position", [
    "site:mha.gov.in annual report 2024 2025 UAPA FCRA India",
    "site:mha.gov.in UAPA arrests India annual report 2022 2023 2024",
    "site:fcraonline.nic.in FCRA cancellation list India 2022 2023 2024 2025",
    "{agenda} site:eci.gov.in Election Commission India official",
    "{agenda} site:pib.gov.in India government official",
    "site:sansad.in UAPA FCRA parliament question India 2022 2025",
  ]),
  bucket("court_legal", "Court and legal sources", 6, 12, ["sci.gov.in", "api.sci.gov.in", "main.sci.gov.in", "indiankanoon.org", "scobserver.in", "livelaw.in", "barandbench.com"], "legal_holding", [
    "Association for Democratic Reforms Election Commission India VVPAT Supreme Court judgment 2024",
    "Supreme Court India EVM VVPAT judgment 26 April 2024",
    "site:api.sci.gov.in VVPAT EVM Election Commission judgment 2024 pdf",
    "Anuradha Bhasin internet shutdown Supreme Court India judgment",
    "Vombatkere Union of India sedition Supreme Court 2022",
    "UAPA bail Supreme Court India 2022 2023 2024 Watali",
    "electoral bonds Supreme Court judgment 2024 India political funding transparency",
  ]),
  bucket("human_rights_watchdog", "Human-rights watchdogs", 6, 12, ["hrw.org", "amnesty.org", "ohchr.org"], "watchdog_assessment", [
    "site:hrw.org India human rights report 2025 UAPA FCRA dissent",
    "site:hrw.org India events of 2024 human rights",
    "site:hrw.org India events of 2023 human rights",
    "site:amnesty.org India UAPA dissent FCRA human rights 2024",
    "site:amnesty.org India human rights 2025",
    "site:ohchr.org India human rights UAPA civil society",
  ]),
  bucket("civic_space", "Civic space", 3, 6, ["civicus.org", "monitor.civicus.org"], "watchdog_assessment", [
    "CIVICUS Monitor India repressed rating 2025",
    "site:monitor.civicus.org India civic space repressed 2024",
    "site:civicus.org India civic space civil society FCRA UAPA",
    "CIVICUS India civil society restrictions 2022 2025",
  ]),
  bucket("press_freedom", "Press freedom", 3, 6, ["rsf.org", "cpj.org"], "watchdog_assessment", [
    "RSF World Press Freedom Index 2025 India rank",
    "RSF World Press Freedom Index 2024 India rank",
    "site:rsf.org India press freedom 2025",
    "site:cpj.org India journalist arrest UAPA 2024",
    "CPJ India press freedom journalists 2022 2025",
  ]),
  bucket("digital_rights", "Digital rights", 4, 8, ["accessnow.org", "internetshutdowns.in", "sflc.in", "internetfreedom.in"], "watchdog_assessment", [
    "Access Now KeepItOn India internet shutdowns 2024 report",
    "Access Now India internet shutdowns 2023 2024 2025",
    "site:internetshutdowns.in India internet shutdowns 2022 2023 2024 2025",
    "site:sflc.in internet shutdowns India 2024",
    "site:internetfreedom.in internet shutdowns India 2024",
  ]),
  bucket("electoral_integrity", "Electoral integrity", 6, 12, ["eci.gov.in", "sci.gov.in", "api.sci.gov.in", "adrindia.org", "thehindu.com", "indianexpress.com", "scobserver.in", "livelaw.in", "barandbench.com"], "legal_holding", [
    "{agenda} Election Commission India official verification",
    "{agenda} Supreme Court India electoral judicial review",
    "{agenda} Supreme Court Election Commission judicial review India",
    "{agenda} Election Commission India verification process",
    "{agenda} Supreme Court judgment India political funding transparency",
    "India electoral integrity evidence verification",
  ]),
  bucket("academic_research", "Academic research", 4, 8, ["epw.in", "cambridge.org", "tandfonline.com", "jstor.org", "sagepub.com", "academic.oup.com", "brill.com"], "academic_interpretation", [
    "site:epw.in India democratic backsliding 2022 2025",
    "site:epw.in India civil liberties UAPA FCRA",
    "site:epw.in India democracy V-Dem Freedom House",
    "India democratic backsliding 2024 journal article",
    "India civil society restrictions FCRA academic article",
  ]),
  bucket("indian_major_media", "Indian major media", 8, 18, ["thehindu.com", "indianexpress.com", "article-14.com", "scroll.in", "thewire.in", "hindustantimes.com"], "journalistic_reporting", [
    "site:thehindu.com India democratic space UAPA FCRA 2024",
    "site:indianexpress.com India UAPA FCRA dissent 2024",
    "site:thehindu.com Supreme Court EVM VVPAT 2024",
    "site:indianexpress.com electoral bonds Supreme Court 2024 democracy",
    "site:article-14.com India UAPA dissent 2024",
    "site:scroll.in India civil liberties FCRA 2025",
    "site:thewire.in India democratic backsliding 2024",
    "site:indianexpress.com NGO FCRA cancellation India 2025",
  ]),
  bucket("comparative_democracy", "Comparative democracy", 3, 6, ["idea.int", "v-dem.net", "freedomhouse.org", "brookings.edu", "carnegieendowment.org", "chathamhouse.org"], "comparative_context", [
    "International IDEA Global State of Democracy 2024 India",
    "India comparative democracy South Asia V-Dem 2025",
    "India autocratization comparative democracy V-Dem 2025",
    "India democratic backsliding global comparison 2024",
  ]),
  bucket("parliamentary_records", "Parliamentary records", 2, 6, ["sansad.in", "prsindia.org", "pib.gov.in"], "official_position", [
    "site:sansad.in UAPA FCRA India parliament question 2022",
    "site:sansad.in internet shutdowns India parliament question 2023",
    "site:prsindia.org UAPA India parliament 2024",
    "site:prsindia.org FCRA India parliament 2024",
  ]),
  bucket("legal_commentary", "Legal commentary", 2, 5, ["scobserver.in", "livelaw.in", "barandbench.com", "article-14.com"], "legal_holding", [
    "India democratic backsliding Supreme Court legal commentary 2024",
    "UAPA FCRA civil liberties India legal commentary 2025",
  ]),
  bucket("policy_research", "Policy research", 2, 5, ["prsindia.org", "cprindia.org", "orfonline.org", "carnegieendowment.org"], "debate_utility", [
    "India democratic institutions policy safeguards 2024 parliamentary research",
    "India civil liberties democratic accountability policy recommendations",
  ]),
];

const GENERIC_INDIAN_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Government and official records", 3, 6, ["pib.gov.in", "sansad.in", "mpa.gov.in", "data.gov.in", "mospi.gov.in"], "official_position", [
    "{agenda} site:sansad.in parliament question",
    "{agenda} site:pib.gov.in government India",
    "{agenda} site:mpa.gov.in bill parliament",
    "{agenda} India official data statistics report",
  ]),
  bucket("parliamentary_records", "Parliamentary records", 3, 6, ["sansad.in", "prsindia.org", "loksabha.nic.in", "rajyasabha.nic.in"], "official_position", [
    "{agenda} site:sansad.in parliament question",
    "{agenda} site:prsindia.org bill committee report",
    "{agenda} Lok Sabha Rajya Sabha debate",
  ]),
  bucket("court_legal", "Court and legal sources", 2, 4, ["sci.gov.in", "scobserver.in", "scconline.com"], "legal_holding", [
    "{agenda} site:sci.gov.in Supreme Court judgment India",
    "{agenda} site:scobserver.in Supreme Court India",
    "{agenda} site:scconline.com/blog Supreme Court India",
  ]),
  bucket("legal_commentary", "Legal commentary", 2, 4, ["scobserver.in", "livelaw.in", "barandbench.com", "article-14.com"], "legal_holding", [
    "{agenda} Supreme Court Observer legal analysis India",
    "{agenda} LiveLaw Bar and Bench analysis India",
  ]),
  bucket("policy_research", "Policy research", 2, 4, ["prsindia.org", "niti.gov.in", "cprindia.org", "orfonline.org"], "debate_utility", [
    "{agenda} site:prsindia.org policy brief parliament India",
    "{agenda} NITI Aayog policy research India",
    "{agenda} CPR ORF policy analysis India",
  ]),
  bucket("academic_research", "Academic research", 2, 4, ["epw.in", "jstor.org", "cambridge.org", "sagepub.com"], "academic_interpretation", [
    "{agenda} academic research India",
    "{agenda} site:epw.in India policy analysis",
  ]),
  bucket("human_rights_watchdog", "Civil society and watchdogs", 1, 3, ["hrw.org", "amnesty.org", "civicus.org", "prsindia.org"], "watchdog_assessment", [
    "{agenda} civil society report India",
    "{agenda} rights watchdog India policy",
  ]),
  bucket("indian_major_media", "Indian major media", 3, 6, ["thehindu.com", "indianexpress.com", "hindustantimes.com"], "journalistic_reporting", [
    "{agenda} site:thehindu.com Parliament India",
    "{agenda} site:indianexpress.com Parliament India",
    "{agenda} credible Indian media explained",
  ]),
];

const CONSTITUTIONAL_LAW_BUCKETS: SourceBucket[] = [
  bucket("court_legal", "Court and constitutional law", 4, 9, ["sci.gov.in", "api.sci.gov.in", "main.sci.gov.in", "indiankanoon.org"], "legal_holding", [
    "{agenda} Supreme Court India constitutional judgment",
    "{agenda} site:sci.gov.in judgment pdf Article Constitution India",
    "{agenda} indiankanoon Supreme Court Article Constitution",
  ]),
  bucket("legal_commentary", "Legal commentary", 2, 5, ["scobserver.in", "livelaw.in", "barandbench.com", "article-14.com"], "legal_holding", [
    "{agenda} Supreme Court Observer legal analysis",
    "{agenda} LiveLaw Bar and Bench constitutional analysis",
  ]),
  bucket("government_official", "Government official records", 2, 5, ["pib.gov.in", "egazette.nic.in", "lawmin.gov.in"], "official_position", [
    "{agenda} site:pib.gov.in government India",
    "{agenda} site:egazette.nic.in notification India",
  ]),
  bucket("parliamentary_records", "Parliamentary records", 2, 5, ["sansad.in", "prsindia.org"], "official_position", [
    "{agenda} site:sansad.in parliament question",
    "{agenda} site:prsindia.org bill act constitution parliament",
  ]),
  bucket("policy_research", "Policy research", 2, 4, ["prsindia.org", "cprindia.org", "vidhilegalpolicy.in"], "debate_utility", [
    "{agenda} policy brief constitutional law India",
  ]),
  bucket("academic_research", "Academic research", 2, 4, ["epw.in", "cambridge.org", "jstor.org", "sagepub.com"], "academic_interpretation", [
    "{agenda} academic article constitutional law India",
  ]),
];

const SECURITY_POLICY_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Security ministry records", 3, 7, ["mha.gov.in", "pib.gov.in", "mod.gov.in", "egazette.nic.in"], "official_position", [
    "{agenda} site:mha.gov.in annual report security India",
    "{agenda} site:pib.gov.in security policy India",
  ]),
  bucket("court_legal", "Court and legal sources", 3, 6, ["sci.gov.in", "indiankanoon.org", "scobserver.in"], "legal_holding", [
    "{agenda} Supreme Court India security public order judgment",
    "{agenda} AFSPA Manipur Supreme Court human rights judgment",
  ]),
  bucket("human_rights_watchdog", "Rights and watchdog reports", 2, 5, ["hrw.org", "amnesty.org", "ohchr.org"], "watchdog_assessment", [
    "{agenda} human rights watchdog India security policy",
  ]),
  bucket("policy_research", "Security policy research", 2, 5, ["orfonline.org", "idsa.in", "prsindia.org", "carnegieendowment.org"], "debate_utility", [
    "{agenda} security policy research India",
  ]),
  bucket("academic_research", "Academic security research", 2, 4, ["epw.in", "cambridge.org", "tandfonline.com", "jstor.org"], "academic_interpretation", [
    "{agenda} academic research internal security India",
  ]),
  bucket("indian_major_media", "Credible Indian media", 3, 6, ["thehindu.com", "indianexpress.com", "hindustantimes.com"], "journalistic_reporting", [
    "{agenda} The Hindu Indian Express security policy India",
  ]),
];

const ECONOMIC_POLICY_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Economic ministry records", 3, 7, ["finmin.nic.in", "pib.gov.in", "gstcouncil.gov.in", "rbi.org.in", "mospi.gov.in"], "primary_numbers", [
    "{agenda} site:gstcouncil.gov.in GST Council minutes",
    "{agenda} site:pib.gov.in finance ministry India",
    "{agenda} site:rbi.org.in report India",
  ]),
  bucket("parliamentary_records", "Parliamentary and PRS records", 2, 5, ["sansad.in", "prsindia.org"], "official_position", [
    "{agenda} site:sansad.in parliament question finance",
    "{agenda} site:prsindia.org GST bill finance commission",
  ]),
  bucket("policy_research", "Economic policy research", 3, 7, ["prsindia.org", "niti.gov.in", "cprindia.org", "orfonline.org"], "debate_utility", [
    "{agenda} economic policy research India federalism",
  ]),
  bucket("academic_research", "Academic economic research", 2, 5, ["epw.in", "ncaer.org", "cambridge.org", "jstor.org"], "academic_interpretation", [
    "{agenda} academic research fiscal federalism India",
  ]),
  bucket("indian_major_media", "Credible Indian media", 2, 5, ["thehindu.com", "indianexpress.com", "livemint.com", "businessstandard.com"], "journalistic_reporting", [
    "{agenda} Indian media economic policy GST federalism",
  ]),
];

const FEDERALISM_BUCKETS: SourceBucket[] = [
  ...CONSTITUTIONAL_LAW_BUCKETS.slice(0, 4),
  bucket("government_official", "Centre-State official records", 3, 7, ["interstatecouncil.gov.in", "pib.gov.in", "finmin.nic.in", "gstcouncil.gov.in"], "official_position", [
    "{agenda} Centre State relations official India",
    "{agenda} site:gstcouncil.gov.in centre state GST Council",
  ]),
  bucket("policy_research", "Federalism policy research", 3, 7, ["prsindia.org", "cprindia.org", "orfonline.org", "vidhilegalpolicy.in"], "debate_utility", [
    "{agenda} federalism policy research India",
    "{agenda} Article 356 federalism policy analysis India",
  ]),
  bucket("academic_research", "Academic federalism research", 2, 5, ["epw.in", "cambridge.org", "jstor.org", "sagepub.com"], "academic_interpretation", [
    "{agenda} academic research Indian federalism",
  ]),
  bucket("indian_major_media", "Credible Indian media", 2, 5, ["thehindu.com", "indianexpress.com", "livemint.com", "businessstandard.com"], "journalistic_reporting", [
    "{agenda} credible Indian media federalism Centre State relations",
  ]),
];

const SOCIAL_POLICY_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Social ministry records", 3, 6, ["pib.gov.in", "socialjustice.gov.in", "education.gov.in", "mohfw.gov.in"], "official_position", [
    "{agenda} site:pib.gov.in social policy India",
  ]),
  bucket("court_legal", "Rights and court sources", 2, 5, ["sci.gov.in", "indiankanoon.org", "scobserver.in"], "legal_holding", [
    "{agenda} Supreme Court rights social policy India",
  ]),
  bucket("policy_research", "Social policy research", 3, 6, ["prsindia.org", "niti.gov.in", "cprindia.org"], "debate_utility", [
    "{agenda} social policy research India",
  ]),
  bucket("academic_research", "Academic social policy", 2, 5, ["epw.in", "jstor.org", "sagepub.com"], "academic_interpretation", [
    "{agenda} academic social policy India",
  ]),
  bucket("human_rights_watchdog", "Rights watchdogs", 2, 4, ["hrw.org", "amnesty.org", "ohchr.org"], "watchdog_assessment", [
    "{agenda} rights watchdog social policy India",
  ]),
  bucket("indian_major_media", "Credible Indian media", 2, 5, ["thehindu.com", "indianexpress.com"], "journalistic_reporting", [
    "{agenda} Indian media social policy",
  ]),
];

const EDUCATION_POLICY_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Education ministry and UGC records", 5, 10, ["ugc.gov.in", "education.gov.in", "pib.gov.in", "egazette.nic.in", "aicte-india.org", "deb.ugc.ac.in", "aishe.gov.in", "swayam.gov.in"], "official_position", [
    "{agenda} site:ugc.gov.in regulations 2026 higher education",
    "site:ugc.gov.in \"UGC\" \"Regulations\" \"2026\" \"higher education\"",
    "site:ugc.gov.in \"Minimum Qualifications\" \"Appointment\" \"Promotion\" \"Teachers\"",
    "site:ugc.gov.in \"Institutions Deemed to be Universities\" Regulations",
    "site:ugc.gov.in \"Open and Distance Learning\" \"Online Programmes\" Regulations",
    "site:ugc.gov.in \"Academic Collaboration\" \"Foreign Higher Educational Institutions\"",
    "site:deb.ugc.ac.in \"Open and Distance Learning\" \"Online\" UGC",
    "site:aicte-india.org \"foreign collaboration\" higher education India",
    "site:aishe.gov.in \"higher education\" India UGC",
    "site:swayam.gov.in \"UGC\" \"online courses\" credits",
    "{agenda} site:ugc.gov.in academic collaboration foreign higher educational institutions",
    "{agenda} site:education.gov.in higher education policy India UGC",
    "site:education.gov.in \"UGC\" \"National Education Policy\" \"higher education\"",
    "{agenda} site:pib.gov.in UGC regulations higher education India",
    "site:pib.gov.in \"UGC\" \"Regulations\" \"higher education\"",
    "{agenda} site:egazette.nic.in UGC regulations higher education",
  ]),
  bucket("parliamentary_records", "Parliamentary education records", 3, 6, ["sansad.in", "prsindia.org", "education.gov.in"], "official_position", [
    "{agenda} site:sansad.in UGC higher education parliament question",
    "{agenda} site:prsindia.org education demand for grants higher education UGC",
    "site:prsindia.org \"Demand for Grants\" \"Education\" \"Higher Education\" \"UGC\"",
    "site:prsindia.org \"University Grants Commission\" \"higher education\"",
    "{agenda} parliament question UGC higher education autonomy India",
  ]),
  bucket("court_legal", "Court and legal education sources", 2, 5, ["sci.gov.in", "indiankanoon.org", "scobserver.in", "livelaw.in", "barandbench.com"], "legal_holding", [
    "{agenda} UGC university autonomy Supreme Court India",
    "{agenda} higher education regulation Supreme Court India UGC",
    "{agenda} site:scobserver.in UGC university regulation Supreme Court",
    "site:scobserver.in \"UGC\" \"equity regulations\"",
    "site:livelaw.in \"UGC\" \"Regulations\" \"Supreme Court\" \"universities\"",
    "site:barandbench.com \"UGC\" \"Regulations\" \"Supreme Court\" \"universities\"",
  ]),
  bucket("policy_research", "Education policy research", 4, 8, ["prsindia.org", "niti.gov.in", "cprindia.org", "orfonline.org", "educationforallinindia.com"], "debate_utility", [
    "{agenda} higher education policy research India UGC",
    "site:prsindia.org \"Higher Education\" \"University Grants Commission\"",
    "site:niti.gov.in \"higher education\" \"digital learning\" India",
    "site:orfonline.org \"foreign universities\" \"higher education\" India",
    "{agenda} foreign university collaboration India higher education policy",
    "{agenda} digital learning online higher education India policy",
    "{agenda} academic autonomy UGC regulation India policy analysis",
  ]),
  bucket("academic_research", "Academic education research", 4, 8, ["epw.in", "jstor.org", "sagepub.com", "tandfonline.com", "springer.com"], "academic_interpretation", [
    "{agenda} academic autonomy higher education India journal",
    "site:epw.in \"UGC\" \"higher education\" \"autonomy\"",
    "site:sagepub.com \"higher education\" \"India\" \"digital learning\"",
    "site:tandfonline.com \"higher education\" \"India\" \"foreign universities\"",
    "{agenda} foreign university collaboration India higher education journal",
    "{agenda} digital learning higher education India academic journal",
    "{agenda} Journal of Education and Research UGC India",
  ]),
  bucket("indian_major_media", "Credible Indian education reporting", 4, 8, ["thehindu.com", "indianexpress.com", "hindustantimes.com", "livemint.com"], "journalistic_reporting", [
    "{agenda} site:thehindu.com UGC regulations 2026 higher education",
    "site:thehindu.com \"UGC\" \"regulations\" \"2026\" \"higher education\"",
    "site:thehindu.com \"UGC\" \"foreign universities\" \"higher education\"",
    "{agenda} site:thehindu.com UGC academic autonomy universities",
    "{agenda} site:indianexpress.com UGC regulations higher education India",
    "site:indianexpress.com \"UGC\" \"academic autonomy\" universities",
    "site:livemint.com \"UGC\" \"foreign universities\" \"higher education\"",
    "{agenda} site:hindustantimes.com UGC regulations higher education",
  ]),
];

const TECHNOLOGY_POLICY_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Digital ministry and official records", 3, 7, ["meity.gov.in", "pib.gov.in", "egazette.nic.in", "dpiit.gov.in"], "official_position", [
    "{agenda} site:meity.gov.in digital policy India",
    "{agenda} site:pib.gov.in digital commerce India",
    "{agenda} site:dpiit.gov.in ONDC India policy",
  ]),
  bucket("parliamentary_records", "Parliamentary technology records", 2, 5, ["sansad.in", "prsindia.org"], "official_position", [
    "{agenda} site:sansad.in digital policy parliament question",
    "{agenda} site:prsindia.org digital data protection bill",
  ]),
  bucket("court_legal", "Court and privacy law", 2, 5, ["sci.gov.in", "indiankanoon.org", "scobserver.in"], "legal_holding", [
    "{agenda} Supreme Court privacy technology India",
  ]),
  bucket("policy_research", "Technology policy research", 3, 7, ["prsindia.org", "niti.gov.in", "orfonline.org", "vidhilegalpolicy.in"], "debate_utility", [
    "{agenda} digital governance policy research India",
  ]),
  bucket("digital_rights", "Digital rights research", 2, 5, ["internetfreedom.in", "sflc.in", "accessnow.org"], "watchdog_assessment", [
    "{agenda} digital rights India report",
  ]),
  bucket("academic_research", "Academic technology research", 2, 4, ["epw.in", "jstor.org", "sagepub.com"], "academic_interpretation", [
    "{agenda} academic research digital governance India",
  ]),
  bucket("indian_major_media", "Credible Indian media", 2, 5, ["thehindu.com", "indianexpress.com", "livemint.com"], "journalistic_reporting", [
    "{agenda} Indian media digital policy India",
  ]),
];

const AGRICULTURE_FOOD_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Food and agriculture official records", 3, 7, ["pib.gov.in", "agricoop.nic.in", "dfpd.gov.in", "data.gov.in"], "primary_numbers", [
    "{agenda} site:dfpd.gov.in PDS food security India",
    "{agenda} site:pib.gov.in MSP food security India",
    "{agenda} India food subsidy official data",
  ]),
  bucket("parliamentary_records", "Parliamentary food policy records", 2, 5, ["sansad.in", "prsindia.org"], "official_position", [
    "{agenda} site:sansad.in food security parliament question",
    "{agenda} site:prsindia.org agriculture food security bill",
  ]),
  bucket("policy_research", "Food policy research", 3, 7, ["prsindia.org", "niti.gov.in", "ifpri.org", "cprindia.org"], "debate_utility", [
    "{agenda} food security policy research India",
    "{agenda} PDS MSP agriculture policy analysis India",
  ]),
  bucket("academic_research", "Academic food policy", 2, 5, ["epw.in", "jstor.org", "sagepub.com"], "academic_interpretation", [
    "{agenda} academic food security India",
  ]),
  bucket("indian_major_media", "Credible Indian media", 2, 5, ["thehindu.com", "indianexpress.com", "hindustantimes.com"], "journalistic_reporting", [
    "{agenda} Indian media food security MSP PDS",
  ]),
];

const ENVIRONMENT_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Environment official records", 3, 7, ["moef.gov.in", "pib.gov.in", "cpcb.nic.in", "jalshakti-dowr.gov.in"], "official_position", [
    "{agenda} site:moef.gov.in environment policy India",
    "{agenda} site:cpcb.nic.in pollution data India",
    "{agenda} site:pib.gov.in climate environment India",
  ]),
  bucket("parliamentary_records", "Parliamentary environment records", 2, 5, ["sansad.in", "prsindia.org"], "official_position", [
    "{agenda} site:sansad.in environment parliament question",
    "{agenda} site:prsindia.org environment bill committee",
  ]),
  bucket("court_legal", "Environmental court sources", 2, 5, ["sci.gov.in", "greentribunal.gov.in", "indiankanoon.org"], "legal_holding", [
    "{agenda} Supreme Court environment judgment India",
    "{agenda} National Green Tribunal India order",
  ]),
  bucket("policy_research", "Environment policy research", 3, 6, ["cprindia.org", "teriin.org", "orfonline.org"], "debate_utility", [
    "{agenda} climate environment policy research India",
  ]),
  bucket("academic_research", "Academic environment research", 2, 5, ["epw.in", "jstor.org", "nature.com", "sciencedirect.com"], "academic_interpretation", [
    "{agenda} academic environment climate India",
  ]),
  bucket("indian_major_media", "Credible Indian media", 2, 5, ["thehindu.com", "indianexpress.com", "downtoearth.org.in"], "journalistic_reporting", [
    "{agenda} Indian media climate environment",
  ]),
];

const ELECTORAL_POLICY_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Election Commission and official records", 3, 7, ["eci.gov.in", "pib.gov.in"], "official_position", [
    "{agenda} site:eci.gov.in Election Commission India",
    "{agenda} site:pib.gov.in Election Commission India",
  ]),
  bucket("court_legal", "Electoral court sources", 3, 7, ["sci.gov.in", "indiankanoon.org", "scobserver.in"], "legal_holding", [
    "{agenda} Supreme Court election judgment India",
  ]),
  bucket("electoral_integrity", "Electoral integrity research", 3, 7, ["eci.gov.in", "adrindia.org", "prsindia.org"], "legal_holding", [
    "{agenda} electoral integrity India ECI ADR",
  ]),
  bucket("policy_research", "Electoral policy research", 2, 5, ["prsindia.org", "cprindia.org"], "debate_utility", [
    "{agenda} election policy research India",
  ]),
  bucket("indian_major_media", "Credible Indian media", 3, 6, ["thehindu.com", "indianexpress.com"], "journalistic_reporting", [
    "{agenda} Indian media election policy India",
  ]),
];

const FOREIGN_POLICY_BUCKETS: SourceBucket[] = [
  bucket("government_official", "Foreign ministry and official records", 3, 7, ["mea.gov.in", "pib.gov.in", "mod.gov.in"], "official_position", [
    "{agenda} site:mea.gov.in India foreign policy",
    "{agenda} site:pib.gov.in foreign policy India",
    "{agenda} site:mod.gov.in India border security LAC",
  ]),
  bucket("policy_research", "Foreign policy research", 3, 8, ["orfonline.org", "idsa.in", "carnegieendowment.org", "brookings.edu"], "debate_utility", [
    "{agenda} foreign policy research India",
    "{agenda} LAC India China policy research",
  ]),
  bucket("academic_research", "Academic foreign policy", 2, 5, ["epw.in", "cambridge.org", "tandfonline.com", "jstor.org"], "academic_interpretation", [
    "{agenda} academic India China foreign policy",
  ]),
  bucket("indian_major_media", "Credible Indian media", 3, 7, ["thehindu.com", "indianexpress.com", "hindustantimes.com"], "journalistic_reporting", [
    "{agenda} Indian media foreign policy India China LAC",
  ]),
];

const TOPIC_BUCKETS: Partial<Record<AgendaContract["topicType"], SourceBucket[]>> = {
  constitutional_law: CONSTITUTIONAL_LAW_BUCKETS,
  indian_security_policy: SECURITY_POLICY_BUCKETS,
  indian_economic_policy: [...ECONOMIC_POLICY_BUCKETS, ...FEDERALISM_BUCKETS.slice(4, 7)],
  indian_federalism: FEDERALISM_BUCKETS,
  indian_social_policy: SOCIAL_POLICY_BUCKETS,
  welfare_social_policy: SOCIAL_POLICY_BUCKETS,
  education_policy: EDUCATION_POLICY_BUCKETS,
  health_policy: SOCIAL_POLICY_BUCKETS,
  labour_gig_economy: SOCIAL_POLICY_BUCKETS,
  technology_data_ai_governance: TECHNOLOGY_POLICY_BUCKETS,
  environment_climate: ENVIRONMENT_BUCKETS,
  agriculture_food_policy: AGRICULTURE_FOOD_BUCKETS,
  judiciary_legal_reform: CONSTITUTIONAL_LAW_BUCKETS,
  indian_electoral_policy: ELECTORAL_POLICY_BUCKETS,
  electoral_reform: ELECTORAL_POLICY_BUCKETS,
  foreign_policy_india: FOREIGN_POLICY_BUCKETS,
  generic_indian_parliament: GENERIC_INDIAN_BUCKETS,
  unsupported_un_mun: GENERIC_INDIAN_BUCKETS,
};

function uniqueBuckets(buckets: SourceBucket[]): SourceBucket[] {
  const seen = new Set<SourceBucketId>();
  const out: SourceBucket[] = [];
  for (const bucket of buckets) {
    if (seen.has(bucket.id)) continue;
    seen.add(bucket.id);
    out.push(bucket);
  }
  return out;
}

function bucket(
  id: SourceBucketId,
  label: string,
  minSources: number,
  idealSources: number,
  preferredDomains: string[],
  evidenceUse: SourceBucket["evidenceUse"],
  queryTemplates: string[],
): SourceBucket {
  return {
    id,
    label,
    purpose: label,
    minSources,
    idealSources,
    maxRawResults: Math.max(20, idealSources * 6),
    preferredDomains,
    acceptableDomains: preferredDomains,
    blockedDomains: ["quora.com", "reddit.com", "medium.com", "byjus.com", "toppr.com"],
    requiredForThesis: true,
    fullTextRequired: ["democracy_index", "government_official", "court_legal", "human_rights_watchdog", "electoral_integrity", "academic_research"].includes(id),
    queryTemplates,
    evidenceUse,
  };
}
