# Foundation decisions

Both supplied PDFs were read in full (four-page challenge, three-page reference), with page renders inspected alongside extracted text.

## Brief interpretation

FINN combines push intelligence (material portfolio changes, configurable digests and alerts) and pull intelligence (company research rooted in annual reports and earnings-call transcripts). The challenge values prioritization, mobile interaction, concise presentation, traceability, and a small working experience. It requests 15–20 portfolio companies across sectors and sizes, plus several companies for ad-hoc research.

The reference distinguishes material events such as results, M&A, management changes and capital expenditure from routine disclosures. It defines revenue, EBITDA, PBT, PAT, YoY/QoQ comparisons, cash conversion, leverage, guidance, and other research concepts.

## Implemented in this phase

The user's narrower scope takes precedence over the full challenge. This phase provides a local frontend only: dashboard, 18-company portfolio, alerts, and a research composer. The responsive design uses a persistent desktop sidebar and a four-item mobile bottom navigation. A restrained green palette, serif page headings, spacious cards, and compact data rows aim for a considered investor workspace.

All company events and numbers are explicitly fictional. The results example includes revenue, EBITDA, PBT and PAT with YoY/QoQ comparisons. Routine alerts are separately accessible. Review status persists locally. Four outside-portfolio company names are selectable for future research. The research composer does not pretend to answer arbitrary questions or cite nonexistent documents.

## Future seams

- Replace typed fixtures through a data-access layer while retaining reusable presentational components.
- Introduce end-of-day price/volume adapters and timestamped exchange-filings ingestion.
- Add source IDs, document URLs, reporting periods and evidence spans before presenting real extracted figures.
- Ground research only in annual reports and earnings-call transcripts; expose uncertainty and unavailable sources.
- Add configurable alert rules, scheduling, authentication, durable storage, and model routing only when that phase is requested.

No trade execution, real financial recommendations, or fabricated live signals are part of this foundation.
