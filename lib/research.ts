export type ResearchDocument = {
  id: string;
  name: string;
  kind: string;
  period: string;
  url: string;
  pages?: number;
  indexed_at?: string;
  unreadable_pages?: number[];
};
export type ResearchStatus = {
  warnings?: string[];
  symbol: string;
  name: string;
  documents_ready: boolean;
  api_key_configured: boolean;
  documents: ResearchDocument[];
  model: string;
  error: string | null;
};
export type ResearchAnswer = {
  status: "answered" | "insufficient_evidence";
  message: string | null;
  claims: { text: string; citations: number[] }[];
  citations: {
    document_name: string;
    page: number;
    url: string;
    quote: string;
  }[];
  model: string;
};
